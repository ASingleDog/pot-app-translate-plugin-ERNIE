// @ts-check

// @ts-ignore
// const fs = require('fs');
// 默认的系统提示词
const DEFAULT_SYSTEM_PROMPT = "You are a professional translation engine.";
// 默认的提示词列表，使用JSON格式表示
const DEFAULT_PROMPTS = JSON.stringify([
  {
    role: "user",
    content:
      "You are a professional translation engine, please translate the text into a colloquial, professional, elegant and fluent content, without the style of machine translation. You must only translate the text content, never interpret it.",
  },
  {
    role: "assistant",
    content: "Ok, I will only translate the text content, never interpret it.",
  },
  { role: "user", content: `Translate into Chinese\n"""\nhello\n"""` },
  { role: "assistant", content: "你好" },
  { role: "user", content: `Translate into $to$\n"""\n$text$\n"""` }
]);
// 默认的temperature值
const DEFAULT_TEMPERATURE = "0.6";
// 默认的top_p值
const DEFAULT_TOP_P = "0.9";
// 默认的penalty_score值
const DEFAULT_PENALTY_SCORE = "1.0";
// 默认的请求URL
const DEFAULT_REQUEST_URL =
  "https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/";

// 调用接口获取最新的访问令牌
async function getNewAccessToken(api_key, secret_key, utils) {
  const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${api_key}&client_secret=${secret_key}`;
  const result = (await utils.http.fetch(url, { method: "POST" })).data;
  if (result.access_token) {
    return result.access_token;
  } else {
    throw new Error("Access token not found in response");
  }
}

function writeTextFile(accessTokenCachePath, content, utils) {
  // fs.writeFile(accessTokenCachePath, JSON.stringify(jsonValue));
  // utils里面的函数只能读不能写，还得走系统调用……
  // 真无语……
  if (utils.osType === "Windows_NT") {
    utils.run(`powershell echo '${content}' > '${accessTokenCachePath}'`);
  } else {
    utils.run(`echo '${content}' > '${accessTokenCachePath}'`);
  }
}

// 读取本地缓存的访问令牌或者调用接口获取最新的访问令牌

/** @type {(api_key: string, secret_key: string, utils: {http, readBinaryFile, readTextFile, Database, CryptoJS, run, cacheDir, pluginDir, osType, writeTextFile}) => Promise<string>} */
async function getAccessToken(api_key, secret_key, utils) {
  const accessTokenCachePath = `${utils.cacheDir}/com.pot-app.desktop/plugins/translate/[plugin].com.pot-app.baidu-ernie-free/access_token.json`;

  try {
    const content = await utils.readTextFile(accessTokenCachePath);
    const jsonValue = JSON.parse(content);
    const accessToken = jsonValue["access_token"];
    const timestamp = jsonValue["timestamp"];

    // 获取当前系统时间戳
    const currentTimestamp = Math.floor(Date.now() / 1000);

    // 检查文件中的时间戳是否过期（过期条件为：当前系统时间戳 - timestamp > 604800，即 7 天）
    if (currentTimestamp - timestamp > 604800) {
      // 如果过期，调用接口获取最新的访问令牌
      const newAccessToken = await getNewAccessToken(
        api_key,
        secret_key,
        utils
      );
      const newJsonValue = {
        access_token: newAccessToken,
        timestamp: currentTimestamp,
      };

      writeTextFile(accessTokenCachePath, JSON.stringify(newJsonValue), utils);
      return newAccessToken;
    } else {
      return accessToken;
    }
  } catch (error) {
    // 如果文件不存在，说明是插件安装后第一次调用，需要调用接口获取最新的访问令牌
    const newAccessToken = await getNewAccessToken(api_key, secret_key, utils);
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const newJsonValue = {
      access_token: newAccessToken,
      timestamp: currentTimestamp,
    };

    writeTextFile(accessTokenCachePath, JSON.stringify(newJsonValue), utils);
    return newAccessToken;
  }
}

async function translate(text, from, to, options) {
  const { config, detect, setResult, utils } = options;

  // 检查config是否包含必要的参数，如果没有则报错
  const api_key = config.api_key;
  const secret_key = config.secret_key;
  const model_string = config.model_string || "ernie_speed";

  if (!api_key || !secret_key || !model_string) {
    throw new Error("缺少必要参数: api_key, secret_key, 或 模型名称");
  }

  // 使用config中的可选参数为变量赋值，如果没有则使用默认值
  const system_prompt = config.system_prompt || DEFAULT_SYSTEM_PROMPT;
  const prompts = config.prompts || DEFAULT_PROMPTS;
  const temperature = parseFloat(config.temperature || DEFAULT_TEMPERATURE);
  const top_p = parseFloat(config.top_p || DEFAULT_TOP_P);
  const penalty_score = parseFloat(
    config.penalty_score || DEFAULT_PENALTY_SCORE
  );
  const request_url = config.request_url || DEFAULT_REQUEST_URL;

  // 检查参数值的范围
  if (!(0.0 < temperature && temperature <= 1.0)) {
    throw new Error("temperature参数范围有误，正确的范围是(0, 1.0]");
  }
  if (!(0.0 <= top_p && top_p <= 1.0)) {
    throw new Error("top_p参数范围有误，正确的范围是[0.0, 1.0]");
  }
  if (!(1.0 <= penalty_score && penalty_score <= 2.0)) {
    throw new Error("penalty_score参数范围有误，正确的范围是[1.0, 2.0]");
  }

  // 构造请求的payload: 将prompts中的$to$替换为to, $text$替换为text, 然后转换为json格式payload
  const promptsList = JSON.parse(prompts);
  const newPromptsList = promptsList.map((prompt) => {
    let newPrompt = { ...prompt };
    if (newPrompt.content) {
      newPrompt.content = newPrompt.content
        .replace("$to$", to)
        .replace("$text$", text);
    }
    return newPrompt;
  });

  // 构造请求的payload
  const payload = {
    messages: newPromptsList,
    stream: false,
    temperature: temperature,
    top_p: top_p,
    penalty_score: penalty_score,
    system: system_prompt,
    max_output_tokens: 2048,
  };

  // 获取访问令牌
  const access_token = await getAccessToken(api_key, secret_key, utils);
  const url = `${request_url}${model_string}?access_token=${access_token}`;

  // 发送请求并处理响应

  const response = await utils.http.fetch(url, {
    method: "POST",
    // 这个请求体定义真怪
    // 多写点文档好不好……全是坑！
    body: {
      type: "Json",
      payload,
    },
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (response.ok) {
    /** @type {{result: string, error_msg?: string}} */
    const result = response.data;
    const resultText = result.result;
    if (resultText) {
      // setResult(resultText);
      return resultText;
    } else {
      throw new Error("响应中未找到翻译结果" + JSON.stringify(result));
    }
  } else {
    const errorMsg = response.error_msg || "请求失败";
    throw new Error(`请求失败: ${errorMsg}`);
  }
}

// // 供测试用的函数
// async function tryRequest() {
//     const needs = {
//         "api_key": "your_api_key",
//         "secret_key": "your_secret_key",
//         "model_string": "ernie-lite-8k",
//         "temperature": "0.1"
//     };
//     const result = await translate("你好，世界！", "auto", "en", { config: needs, detect: null, setResult: console.log, utils: /* Your utils object here */ });
//     console.log(result);
// }
