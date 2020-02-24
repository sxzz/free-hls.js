#!/usr/bin/env node
const process = require("process");
const path = require("path");
const fs = require("fs");

const qs = require("qs");
const shelljs = require("shelljs");
const axios = require("axios");
const glob = require("glob");
const FormData = require("form-data");
const PromisePool = require("es6-promise-pool");
require("dotenv").config();

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

  const rate = bit_rate(file);
  const vcodec = video_codec(file);
  const segment_time = Math.min(20, parseInt(((20 * 2) << 22) / (rate * 1.35)));

  // LIMITED
  if (rate > 6e6 || process.argv[4] == "LIMITED") {
    br = Math.min(rate, 15e6);
    sub += ` -b:v ${br} -maxrate ${16e6} -bufsize ${parseInt(16e6 / 1.5)}`;
    vcodec = "h264";
    segment_time = 5;
  }

  // SEGMENT_TIME
  if (!isNaN(parseInt(process.argv[4]))) {
    sub += ` -segment_time ${parseInt(argv[4])}`;
  }

  return ` -i ${file} -vcodec ${vcodec} -acodec aac -map 0 -f segment -segment_list out.m3u8 ${sub} out%05d.ts`;
}

async function upload_yuque(file) {
  const data = new FormData();
  data.append("file", fs.createReadStream(file), {
    filename: "image.png",
    contentType: "image/png"
  });

  let res;
  try {
    res = await axios({
      url: `https://www.yuque.com/api/upload/attach?ctoken=${process.env.YUQUE_CTOKEN}`,
      method: "POST",
      data,
      headers: {
        Referer: "https://www.yuque.com/yuque/topics/new",
        Cookie: `ctoken=${process.env.YUQUE_CTOKEN}; _yuque_session=${process.env.YUQUE_SESSION}`,
        ...data.getHeaders()
      }
    });
  } catch (err) {
    if (err.response.status === 403) {
      console.warn("⚠️ Cookie 已过期");
      process.exit();
    } else {
      return Promise.reject(err);
    }
  }

  if (res.data.data && res.data.data.url) {
    return { filename: path.basename(file), url: res.data.data.url };
  } else {
    return null;
  }
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
  const title = process.argv[3]
    ? process.argv[3]
    : path.parse(process.argv[2], ".mp4")["name"];
  const tmpDir = path.resolve(__dirname, "tmp");
  const file = path.resolve(process.argv[2]);
  const command = await command_generator(file);

  if (fs.existsSync(tmpDir)) {
    shelljs.rm("-rf", tmpDir);
  }
  fs.mkdirSync(tmpDir);

  process.chdir(tmpDir);

  console.info(`ffmpeg ${command}`);
  shelljs.exec(`ffmpeg ${command}`);

  let lines = fs.readFileSync("out.m3u8", { encoding: "utf-8", flag: "r" });
  const ts_files = glob.sync("*.ts");
  let i = 0;

  const generatePromises = function*() {
    for (const ts_file of ts_files) {
      yield upload_yuque(ts_file);
    }
  };
  const concurrency = 10;
  const promiseIterator = generatePromises();
  const pool = new PromisePool(promiseIterator, concurrency);
  pool.addEventListener("fulfilled", event => {
    const { filename, url } = event.data.result;
    lines = lines.replace(filename, url);
    i++;
    console.info(`[${i}/${ts_files.length}] Uploaded ${filename} to ${url}`);
  });
  await pool.start();

  console.info(
    `This video has been published to: ${await publish(lines, title)}`
  );
}

main();
