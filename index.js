import puppeteer from "puppeteer";
import "dotenv/config.js";

let lastLink = "https://streeteasy.com/building/47-st-felix-street-brooklyn/3r";

const randomSleep = async () => {
  return new Promise((resolve) =>
    setTimeout(resolve, Math.random() * 120000 + 30000)
  );
};

const getLink = (listing) => {
  return listing.blocks[2].text.text.replace("<", "").replace(">", "");
};

const setLastListing = (post) => {
  lastLink = getLink(post);
};

const getNewListings = (posts) => {
  let hasReachedLast = false;
  let i = 0;
  while (!hasReachedLast && i < posts.length) {
    if (lastLink === posts[i].link) hasReachedLast = true;
    else i++;
  }
  return posts.slice(0, i);
};

const getConversation = async () => {
  fetch("https://slack.com/api/conversations.history?channel=C06PP3CG8KH", {
    method: "GET",
    headers: {
      Authorization: "Bearer " + process.env.USER_AUTH_TOKEN,
    },
  })
    .then((response) => {
      return response.json();
    })
    .then((data) => {
      const botMsgs = data["messages"].filter(
        (e) => e.hasOwnProperty("subtype") && e["subtype"] === "bot_message"
      );
      setLastListing(botMsgs[0]);
    });
};

const getListings = async (url) => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
  });
  const page = await browser.newPage();

  await page.setExtraHTTPHeaders({
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "upgrade-insecure-requests": "1",
    "accept-encoding": "gzip, deflate, br, zstd",
    "accept-language": "en-US,en;q=0.9",
  });

  await page.goto(url, {
    waitUntil: "domcontentloaded",
  });

  const listings = await page.evaluate(() => {
    const elements = document.querySelectorAll(".searchCardList--listItem");
    return Array.from(elements).map((listing) => {
      const listingCard = listing.querySelector(".listingCard");
      const title = listingCard.querySelector(".u-displayNone").innerText;
      const link = listing.querySelector(".listingCard-globalLink").href;
      const image = listingCard
        .querySelector(".listingCardTop")
        .querySelector(".SRPCarousel")
        .querySelector(".flickity-viewport")
        .querySelector(".flickity-slider")
        .querySelector(".SRPCarousel-imageContainer")
        .querySelector(".SRPCarousel-image").src;
      return { title, link, image };
    });
  });
  return getNewListings(listings);
};

const sendToSlack = async (listings) => {
  let body = { blocks: [] };
  listings.map((listing) => {
    body.blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: listing.title,
      },
    });
    body.blocks.push({
      type: "image",
      image_url: listing.image,
      alt_text: "listing photo",
    });
    body.blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${listing.link}`,
      },
    });
  });
  fetch(process.env.WEBHOOK_URL, {
    method: "POST",
    body: JSON.stringify({
      blocks: body.blocks,
    }),
    headers: {
      "Content-type": "application/json",
    },
  }).then(async (response) => {
    await getConversation();
  });
};

while (true) {
  console.log("Running...");
  const listings = await getListings(
    "https://streeteasy.com/for-rent/nyc/price:-2000%7Carea:306,305,321,364,322,328,325,307,303,304,301,353,319,326,329,318,302%7Cin_rect:40.655,40.702,-74.027,-73.944"
  );
  await sendToSlack(listings);
  await randomSleep();
}
