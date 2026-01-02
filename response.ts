import fs from "fs";
import path from "path";

const outputDir = path.join(process.cwd(), "output");
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const filePath = path.join(outputDir, "response.txt");

// Convert object to string safely
const content =
  typeof response.data === "string"
    ? response.data
    : JSON.stringify(response.data, null, 2);

fs.writeFileSync(filePath, content, "utf-8");

console.log(`response.data saved to ${filePath}`);
