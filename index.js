const fs = require('fs/promises')
const dayjs = require('dayjs')
const cheerio = require('cheerio')
const _ = require('lodash')
const { Telegraf } = require('telegraf')
const axios = require('axios')

const TOKEN = process.env.TOKEN
const CHANNEL_ID = process.env.CHANNEL_ID
const TRENDING_URL = 'https://m.weibo.cn/api/container/getIndex?containerid=106003type%3D25%26t%3D3%26disable_hot%3D1%26filter_type%3Drealtimehot'
const TRENDING_DETAIL_URL = 'https://m.s.weibo.com/topic/detail?q='

const bot = new Telegraf(TOKEN)

async function saveRawJson (data) {
  const date = dayjs().format('YYYY-MM-DD')
  const fullPath = `./api/${date}.json`
  const words = data.map(o => ({
    title: o.desc,
    category: o.category,
    description: o.description,
    url: o.scheme,
    hot: o.desc_extr,
    ads: !!o.promotion
  }))
  let wordsAlreadyDownload = []
  try {
    await fs.stat(fullPath)
    const content = await fs.readFile(fullPath)
    wordsAlreadyDownload = JSON.parse(content)
  } catch (err) {
    // file not exsit
  }
  const allHots = _.uniqBy(_.concat(words, wordsAlreadyDownload), 'title')
  await fs.writeFile(fullPath, JSON.stringify(allHots))
}

async function sendTgMessage(data) {
  const ranks = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣']
  const text = data.splice(1,20).map((o, i) => {
    if (o.promotion) {
      return `💰[bitcoin:bc1q2lfx6y52p93qwk6y6yhszzfhjdt2anz43xw6ee
]`
    }
    if (ranks[i]) {
      return `${ranks[i]} [${o.desc}](${o.scheme}) ${(o.desc_extr / 10000).toFixed(2)} 万`
    }
    return `🔥 [${o.desc}](${o.scheme}) ${(o.desc_extr / 10000).toFixed(2)} 万`})
  text.unshift(`${dayjs().format('YYYY-MM-DD HH:MM:ss')} 的微博热搜`)
  await bot.telegram.sendMessage(CHANNEL_ID, text.join('\n'), {
    parse_mode: 'Markdown',
    disable_web_page_preview: true
  })
}

async function fetchTrendingDetail (title) {
  const { data } = await axios.get(`${TRENDING_DETAIL_URL}${title}`)
  const $ = cheerio.load(data)
  return {
    category: $('#pl_topicband dl>dd').first().text(),
    desc: $('#pl_topicband dl>dd').last().text()
  }
}

async function bootstrap () {
  const { data } = await axios.get(TRENDING_URL)
  if (data.ok === 1) {
    const items = data.data.cards[0].card_group
    if (items) {
      for (let item of items) {
        const { category, desc } = await fetchTrendingDetail(encodeURIComponent(item.desc))
        item.category = category
        item.description = desc
      }
      await saveRawJson(items)
      await sendTgMessage(items)
    }
  }
  process.exit(0)
}

bootstrap() 
