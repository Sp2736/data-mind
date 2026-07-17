# SmartBI

LLM-orchestrated framework for autonomous exploratory data analysis (EDA) and data pre-processing. Upload a CSV/JSON dataset, and SmartBI generates dataset-specific research questions, writes and self-corrects analysis code, and auto-selects visualizations — producing insights, charts, a cleaned dataset, and a summary with minimal user input.

Built as a research project exploring how far an LLM can autonomously go in the data science pipeline: from "what's worth asking about this data?" to a rendered, explained answer.

## Features

- 📁 Upload massive CSV/JSON datasets
- 🧠 LLM-generated research questions, split into **Pre-processing** and **EDA** categories
- ⚙️ Automatic code generation with a sandboxed execution + self-correction retry loop
- 📊 LLM-selected visualizations bound to a pre-built component library
- 🧹 Downloadable cleaned/pre-processed dataset
- 📝 Auto-generated dataset summary and insight narratives

## Tech stack

- **Frontend:** Next.js
- **Backend:** _TBD_
- **Database:** _TBD_
- **LLM:** Claude / GPT

## Getting started

```bash
git clone https://github.com/<your-username>/smartbi.git
cd smartbi
npm install
npm run dev
```

Create a `.env.local` file with your API keys:

```
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
```

## Project status

🚧 Actively in development as part of an academic research project (CHARUSAT, DEPSTAR).

## License

[MIT](./LICENSE)
