import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { system, message } = req.body || {};

    if (!system || !message) {
      return res.status(400).json({ error: "Missing system or message" });
    }

    const response = await client.responses.create({
      model: "gpt-5.4",
      input: [
        { role: "system", content: system },
        { role: "user", content: message }
      ]
    });

    return res.status(200).json({ text: response.output_text || "" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "OpenAI request failed",
      details: error?.message || "Unknown error"
    });
  }
}
