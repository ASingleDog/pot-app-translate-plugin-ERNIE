// 默认的系统提示词
const DEFAULT_SYSTEM_PROMPT = "You are a professional translation engine.";
// 默认的提示词列表，使用JSON格式表示
const DEFAULT_PROMPTS = JSON.stringify([
    {"role":"user","content":"You are a professional translation engine, skilled in translating text into accurate, professional, fluent, and natural translations, avoiding mechanical literal translations like machine translation. You only translate the text without interpreting it. You only respond with the translated text and do not include any additional content."},
    {"role":"assistant","content":"OK, I will only translate the text content you provided, never interpret it."},
    {"role":"user","content":"Translate the text delimited by ``` below to Simplified Chinese(简体中文), only return translation:\n```\nHello, world!\n```\n"},
    {"role":"assistant","content":"你好，世界！"},
    {"role":"user","content":"Translate the text delimited by ``` below to English, only return translation:\n```\n再见，小明\n```\n"},
    {"role":"assistant","content":"Bye, Xiaoming."},
    {"role":"user","content":"Translate the text delimited by ``` below to $to$, only return translation:\n```\n$src_text$\n```\n"}
]);
// 默认的temperature值
const DEFAULT_TEMPERATURE = "0.6";
// 默认的top_p值
const DEFAULT_TOP_P = "0.9";
// 默认的penalty_score值
const DEFAULT_PENALTY_SCORE = "1.0";
// 默认的请求URL
const DEFAULT_REQUEST_URL = "https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/";

// 调用接口获取最新的访问令牌
async function getNewAccessToken(api_key, secret_key, utils) {
    const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${api_key}&client_secret=${secret_key}`;
    const response = await utils.http.fetch(url, { method: 'POST' });
    const result = await response.json();
    if (result.access_token) {
        return result.access_token;
    } else {
        throw new Error("Access token not found in response");
    }
}

// 读取本地缓存的访问令牌或者调用接口获取最新的访问令牌
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
            const newAccessToken = await getNewAccessToken(api_key, secret_key, utils);
            const newJsonValue = {
                "access_token": newAccessToken,
                "timestamp": currentTimestamp
            };

            await utils.writeTextFile(accessTokenCachePath, JSON.stringify(newJsonValue));
            return newAccessToken;
        } else {
            return accessToken;
        }
    } catch (error) {
        // 如果文件不存在，说明是插件安装后第一次调用，需要调用接口获取最新的访问令牌
        const newAccessToken = await getNewAccessToken(api_key, secret_key, utils);
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const newJsonValue = {
            "access_token": newAccessToken,
            "timestamp": currentTimestamp
        };

        await utils.writeTextFile(accessTokenCachePath, JSON.stringify(newJsonValue));
        return newAccessToken;
    }
}

async function translate(text, from, to, options) {
    const { config, detect, setResult, utils } = options;

    // 检查config是否包含必要的参数，如果没有则报错
    const api_key = config.api_key;
    const secret_key = config.secret_key;
    const model_string = config.model_string;

    if (!api_key || !secret_key || !model_string) {
        throw new Error("缺少必要参数: api_key, secret_key, or model_string");
    }

    // 使用config中的可选参数为变量赋值，如果没有则使用默认值
    const system_prompt = config.system_prompt || DEFAULT_SYSTEM_PROMPT;
    const prompts = config.prompts || DEFAULT_PROMPTS;
    const temperature = parseFloat(config.temperature || DEFAULT_TEMPERATURE);
    const top_p = parseFloat(config.top_p || DEFAULT_TOP_P);
    const penalty_score = parseFloat(config.penalty_score || DEFAULT_PENALTY_SCORE);
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

    // 构造请求的payload: 将prompts中的$to$替换为to, $src_text$替换为text, 然后转换为json格式payload
    const promptsList = JSON.parse(prompts);
    const newPromptsList = promptsList.map(prompt => {
        let newPrompt = { ...prompt };
        if (newPrompt.content) {
            newPrompt.content = newPrompt.content.replace("$to$", to).replace("$src_text$", text);
        }
        return newPrompt;
    });

    // 构造请求的payload
    const payload = {
        "messages": newPromptsList,
        "stream": false,
        "temperature": temperature,
        "top_p": top_p,
        "penalty_score": penalty_score,
        "system": system_prompt,
        "max_output_tokens": 2048
    };

    // 获取访问令牌
    const access_token = await getAccessToken(api_key, secret_key, utils);
    const url = `${request_url}${model_string}?access_token=${access_token}`;

    // 发送请求并处理响应
    const response = await utils.http.fetch(url, {
        method: 'POST',
        body: Body.json(payload),
        headers: {
            'Content-Type': 'application/json'
        }
    });

    const result = await response.json();

    if (response.ok) {
        const resultText = result.result;
        if (resultText) {
            // setResult(resultText);
            return resultText
        } else {
            throw new Error("响应中未找到翻译结果");
        }
    } else {
        const errorMsg = result.error_msg || "请求失败";
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
