#!/usr/bin/env node
const process = require("process");
const path = require("path");
const fs = require("fs");

const qs = require("qs");
const shelljs = require("shelljs");
const axios = require("axios");
const glob = require("glob");
const PromisePool = require("es6-promise-pool");
require("dotenv").config();
const uploader = require("./uploader/" + process.env.UPLOAD_DRIVE);

function bit_rate(file) {
  return parseInt(
    shelljs.exec(
      `ffprobe -v error -show_entries format=bit_rate -of default=noprint_wrappers=1:nokey=1 ${file}`
    )
  );
}

function video_codec(file) {
  const codecs = shelljs
    .exec(
      `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 ${file}`
    )
    .split("\n");
  return codecs.filter(codec => ["h264"].includes(codec)) ? "copy" : "h264";
}

async function command_generator(file) {
  let sub = "";

  let rate = bit_rate(file);
  let vcodec = video_codec(file);
  let segment_time = Math.min(20, parseInt(((20 * 2) << 22) / (rate * 1.35)));

  // LIMITED
  if (rate > 6e6 || process.argv[4] == "LIMITED") {
    let br = Math.min(rate, 15e6);
    sub += ` -b:v ${br} -maxrate ${16e6} -bufsize ${parseInt(16e6 / 1.5)}`;
    vcodec = "h264";
    segment_time = 5;
  }

  // SEGMENT_TIME
  if (!isNaN(parseInt(process.argv[4]))) {
    sub += ` -segment_time ${parseInt(process.argv[4])}`;
  } else {
    sub += ` -segment_time ${segment_time}`;
  }

  return `ffmpeg -i ${file} -vcodec ${vcodec} -acodec aac -bsf:v h264_mp4toannexb -map 0:v:0 -map 0:a? -f segment -segment_list out.m3u8 ${sub} out%05d.ts`;
}

async function publish(code, title = null) {
  const res = await axios.post(
    `${process.env.APIURL}/publish`,
    qs.stringify({
      code,
      title
    })
  );

  if (res.data.code == 0) {
    return `${process.env.APIURL}/play/${res.data.data}`;
  } else {
    return null;
  }
}

async function main() {
  const title = process.argv[3] || path.parse(process.argv[2], ".mp4").name;
  const tmpDir = path.resolve(__dirname, "tmp");
  const file = path.resolve(process.argv[2]);
  const command = await command_generator(file);

  if (fs.existsSync(tmpDir)) {
    shelljs.rm("-rf", tmpDir);
  }
  fs.mkdirSync(tmpDir);

  process.chdir(tmpDir);

  console.info(command);
  shelljs.exec(command);

  let lines = fs.readFileSync("out.m3u8", { encoding: "utf-8", flag: "r" });
  const ts_files = glob.sync("*.ts");
  let completions = 0,
    failures = 0;

  const generatePromises = function*() {
    for (const ts_file of ts_files) {
      yield uploader(ts_file).then(result => {
        completions++;

        if (!result) {
          failures++;
          console.error(
            `[${completions}/${ts_files.length}] Uploaded failed: ${result}`
          );
          return Promise.reject(result);
        }

        const { filename, url } = result;
        lines = lines.replace(filename, url);
        console.info(
          `[${completions}/${ts_files.length}] Uploaded ${filename} to ${url}`
        );
      });
    }
  };
  const concurrency = 10;
  const promiseIterator = generatePromises();
  const pool = new PromisePool(promiseIterator, concurrency);

  try {
    await pool.start();
  } catch (err) {
    console.info(
      `Partially successful: ${completions}/${completions - failures}`
    );
    console.info("You can re-execute this program with the same parameters");
    process.exit();
  }

  fs.writeFileSync("out.m3u8", lines, { flag: "w" });

  console.info(
    `This video has been published to: ${await publish(lines, title)}`
  );
}

main();
