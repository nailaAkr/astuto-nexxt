const express = require("express");
const Database = require("better-sqlite3");
const path = require("path");

const app = express();
const PORT = 3000;

const db = new Database(path.join(__dirname, "ideas.db"));

app.use(express.json());

// Serve only the frontend files, not the database file
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/style.css", (req, res) => {
  res.sendFile(path.join(__dirname, "style.css"));
});

app.get("/app.js", (req, res) => {
  res.sendFile(path.join(__dirname, "app.js"));
});

// Database tables
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ideas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT DEFAULT 'General',
    status TEXT DEFAULT 'Planned',
    votes INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// Safely add project_id to an older ideas table
const ideaColumns = db.prepare("PRAGMA table_info(ideas)").all();

if (!ideaColumns.some(column => column.name === "project_id")) {
  db.exec(
    "ALTER TABLE ideas ADD COLUMN project_id INTEGER REFERENCES projects(id)"
  );
}

// Check website URL
function isValidUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

// Get all companies
app.get("/api/projects", (req, res) => {
  const projects = db.prepare(`
    SELECT projects.*,
      (
        SELECT COUNT(*)
        FROM ideas
        WHERE ideas.project_id = projects.id
      ) AS idea_count
    FROM projects
    ORDER BY projects.id DESC
  `).all();

  res.json(projects);
});

// Add a company
app.post("/api/projects", (req, res) => {
  const { name, url, description } = req.body;

  if (
    typeof name !== "string" ||
    typeof url !== "string" ||
    typeof description !== "string" ||
    !name.trim() ||
    !description.trim() ||
    !isValidUrl(url.trim())
  ) {
    return res.status(400).json({
      error: "Enter a company name, valid website and description."
    });
  }

  const result = db.prepare(`
    INSERT INTO projects (name, url, description)
    VALUES (?, ?, ?)
  `).run(name.trim(), url.trim(), description.trim());

  res.status(201).json({
    id: result.lastInsertRowid,
    name: name.trim(),
    url: url.trim(),
    description: description.trim()
  });
});

// Get one company
app.get("/api/projects/:id", (req, res) => {
  const project = db.prepare(
    "SELECT * FROM projects WHERE id = ?"
  ).get(Number(req.params.id));

  if (!project) {
    return res.status(404).json({ error: "Company not found." });
  }

  res.json(project);
});

// Get feature requests for a company
app.get("/api/projects/:id/ideas", (req, res) => {
  const projectId = Number(req.params.id);

  const project = db.prepare(
    "SELECT id FROM projects WHERE id = ?"
  ).get(projectId);

  if (!project) {
    return res.status(404).json({ error: "Company not found." });
  }

  const ideas = db.prepare(`
    SELECT * FROM ideas
    WHERE project_id = ?
    ORDER BY votes DESC, id DESC
  `).all(projectId);

  res.json(ideas);
});

// Basic fallback if Ollama is unavailable
function findSimilarByWords(newIdea, existingIdeas) {
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "to", "for",
    "of", "in", "on", "and", "with", "i", "want",
    "would", "like", "it", "this", "that", "be"
  ]);

  function getWords(text) {
    return new Set(
      text.toLowerCase()
        .replace(/[^a-z0-9 ]/g, " ")
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.has(word))
    );
  }

  const newWords = getWords(newIdea);

  return existingIdeas.filter(idea => {
    const oldWords = getWords(idea.title + " " + idea.description);

    if (newWords.size === 0 || oldWords.size === 0) {
      return false;
    }

    let common = 0;

    newWords.forEach(word => {
      if (oldWords.has(word)) common++;
    });

    const similarity = common / Math.min(newWords.size, oldWords.size);

    return similarity >= 0.5;
  });
}

// Ask AI to find duplicate requests
app.post("/api/projects/:id/check-idea", async (req, res) => {
  const projectId = Number(req.params.id);
  const { title, description } = req.body;

  if (
    typeof title !== "string" ||
    typeof description !== "string" ||
    !title.trim() ||
    !description.trim() ||
    title.length > 120 ||
    description.length > 2000
  ) {
    return res.status(400).json({
      error: "Enter a valid feature title and description."
    });
  }

  const project = db.prepare(
    "SELECT id FROM projects WHERE id = ?"
  ).get(projectId);

  if (!project) {
    return res.status(404).json({ error: "Company not found." });
  }

  const existingIdeas = db.prepare(`
    SELECT id, title, description, votes, status
    FROM ideas
    WHERE project_id = ?
    ORDER BY votes DESC
    LIMIT 50
  `).all(projectId);

  if (existingIdeas.length === 0) {
    return res.json({
      matches: [],
      method: "AI",
      message: "No existing requests yet. You can submit the first one!"
    });
  }

  try {
    const aiResponse = await fetch(
      "http://127.0.0.1:11434/api/chat",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: process.env.OLLAMA_MODEL || "llama3.2:1b",
          stream: false,
          format: "json",
          messages: [
            {
              role: "system",
              content: `
You are an AI duplicate finder for a public feature-request website.

Compare the new request with the existing requests.

Find requests that ask for the same feature or solve the same user problem.
Different wording can still mean the same thing.
Do not match requests just because they share a general topic.

Return only valid JSON in this format:
{
  "matching_ids": [1, 2],
  "reason": "Short explanation"
}

Use only IDs from the supplied existing requests.
If there is no close match, return an empty matching_ids array.
`
            },
            {
              role: "user",
              content: JSON.stringify({
                newRequest: {
                  title: title.trim(),
                  description: description.trim()
                },
                existingRequests: existingIdeas
              })
            }
          ]
        })
      }
    );

    if (!aiResponse.ok) {
      throw new Error("Ollama could not process the request.");
    }

    const result = await aiResponse.json();
    const content = result.message?.content || "{}";
    const parsed = JSON.parse(content);

    const validIds = new Set(existingIdeas.map(idea => idea.id));

    const matchingIds = Array.isArray(parsed.matching_ids)
      ? parsed.matching_ids.filter(id => validIds.has(Number(id)))
      : [];

    const matches = existingIdeas.filter(idea =>
      matchingIds.includes(idea.id)
    );

    return res.json({
      matches,
      method: "AI",
      message: parsed.reason || "AI comparison completed."
    });

  } catch (error) {
    console.log("AI unavailable:", error.message);

    // Use word matching as a backup
    const matches = findSimilarByWords(
      title + " " + description,
      existingIdeas
    );

    return res.json({
      matches,
      method: "Basic matching",
      message: "Ollama was unavailable, so basic word matching was used."
    });
  }
});

// Submit a new feature request
app.post("/api/projects/:id/ideas", (req, res) => {
  const projectId = Number(req.params.id);
  const { title, description } = req.body;

  if (
    typeof title !== "string" ||
    typeof description !== "string" ||
    !title.trim() ||
    !description.trim() ||
    title.length > 120 ||
    description.length > 2000
  ) {
    return res.status(400).json({
      error: "Enter a valid feature title and description."
    });
  }

  const project = db.prepare(
    "SELECT id FROM projects WHERE id = ?"
  ).get(projectId);

  if (!project) {
    return res.status(404).json({ error: "Company not found." });
  }

  const result = db.prepare(`
    INSERT INTO ideas (project_id, title, description)
    VALUES (?, ?, ?)
  `).run(projectId, title.trim(), description.trim());

  res.status(201).json(
    db.prepare("SELECT * FROM ideas WHERE id = ?")
      .get(result.lastInsertRowid)
  );
});

// Vote for an existing request
app.post("/api/ideas/:id/vote", (req, res) => {
  const ideaId = Number(req.params.id);

  const result = db.prepare(`
    UPDATE ideas
    SET votes = votes + 1
    WHERE id = ?
  `).run(ideaId);

  if (!result.changes) {
    return res.status(404).json({
      error: "Feature request not found."
    });
  }

  res.json(
    db.prepare("SELECT * FROM ideas WHERE id = ?").get(ideaId)
  );
});

// Feature pages
app.get("/feature.html", (req, res) => {
    res.sendFile(path.join(__dirname, "feature.html"));
});

app.get("/feature.js", (req, res) => {
    res.sendFile(path.join(__dirname, "feature.js"));
});

// Keep your existing app.listen below this
app.listen(PORT, () => {
  console.log(`Astuto Next running at http://localhost:${PORT}`);
});