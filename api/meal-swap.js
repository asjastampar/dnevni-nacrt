import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { mealLabel, currentMeal, lactoseFree, easyMode } = req.body || {};

    const prompt = `
Predlagaj EN nov obrok v slovenščini za dnevni plan.

Pravila:
- vrni samo JSON
- brez dodatnega besedila
- obrok naj bo realističen in enostaven za pripravo
- če je lactoseFree true, naj bo brez laktoze
- če je easyMode true, naj bo zelo enostaven za pripravo
- približno 350 do 550 kcal
- sestavine naj bodo v obliki seznama

Podatki:
mealLabel: ${mealLabel || ""}
currentMeal: ${currentMeal || ""}
lactoseFree: ${Boolean(lactoseFree)}
easyMode: ${Boolean(easyMode)}

Vrni točno ta JSON format:
{
  "food": "ime obroka",
  "kcal": 420,
  "ingredients": [
    { "name": "sestavina", "amount": "količina" }
  ]
}
`;

    const response = await client.responses.create({
      model: "gpt-5.2",
      input: prompt,
    });

    const text = response.output_text;
    const parsed = JSON.parse(text);

    return res.status(200).json(parsed);
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "AI meal swap failed",
      details: error.message,
    });
  }
}
