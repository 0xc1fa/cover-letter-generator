const fs = require("fs").promises;
const { exec } = require("child_process");
const path = require("path");
const OpenAI = require("openai");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
require("dotenv").config();
const { JSDOM } = require("jsdom");
const { Readability } = require("@mozilla/readability");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function fetchArticleContent(url) {
  try {
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    return await response.text();
  } catch (error) {
    console.error(`Error fetching article: ${error}`);
    throw error;
  }
}

async function parseArticle(url) {
  const html = await fetchArticleContent(url);
  const dom = new JSDOM(html, { url });
  const document = dom.window.document;
  const article = new Readability(document).parse();
  return { title: article.title, content: article.content };
}

async function movePdfToDownloads(pdfFilePath, companyName, downloadsFolder) {
  const extension = path.extname(pdfFilePath);
  let fileNameWithoutExt = path.basename(pdfFilePath, extension);
  uniqueFilePath = path.join(downloadsFolder, `${fileNameWithoutExt}_${companyName}${extension}`);

  try {
    await fs.copyFile(pdfFilePath, uniqueFilePath);
    console.log(`PDF moved to the Downloads folder successfully as ${path.basename(uniqueFilePath)}`);
  } catch (err) {
    console.error(`Error moving PDF: ${err}`);
  }
}

async function generateLatexDocument(url) {
  const { title, content } = await parseArticle(url);
  const prompt = await fs.readFile("./prompt.txt", "utf8");
  const completion = await openai.chat.completions.create({
    messages: [
      {
        role: "system",
        content: prompt,
      },
      {
        role: "user",
        content: `${prompt}\n${title}\n${content}`,
      },
    ],
    model: "gpt-4",
  });

  const response = completion.choices[0].message.content;
  const [companyName, postTitle, reason] = response.split("\n");

  const latexDir = "./cover-letter-template/";
  const argsContent = `\\companyname{${companyName}}\n\\posttitle{${postTitle}}\n\\reason{${reason}}\n`;
  const mainTexFileName = "cover_letter";
  const argFilePath = path.join(latexDir, "args.tex");
  const pdfFilePath = path.join(latexDir, mainTexFileName + ".pdf");
  const downloadsFolder = path.join(require("os").homedir(), "Downloads");

  await fs.writeFile(argFilePath, argsContent);

  exec(
    `xelatex ${mainTexFileName}.tex`,
    { cwd: latexDir },
    async (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        return;
      }
      console.log(stdout);
      console.error(stderr);

      try {
        await movePdfToDownloads(pdfFilePath, companyName.replace(" ", "_"), downloadsFolder);
        console.log("PDF moved to the Downloads folder successfully.");
      } catch (err) {
        console.error(`Error moving PDF: ${err}`);
      }

      try {
        await Promise.all(
          ["aux", "log"].map((ext) =>
            fs.unlink(`${path.join(latexDir, mainTexFileName)}.${ext}`)
          )
        );
      } catch (err) {
        console.error(`Error cleaning up files: ${err}`);
      }
    }
  );
}

generateLatexDocument(process.argv[2]).catch((err) =>
  console.error(`Failed to generate LaTeX document: ${err}`)
);
