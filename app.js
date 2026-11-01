
const companyList = document.getElementById("companyList");
const companyForm = document.getElementById("companyForm");
const companySearch = document.getElementById("companySearch");
const companyBoard = document.getElementById("companyBoard");
const homePage = document.getElementById("homePage");

let currentProject = null;

// API helper
// API helper
async function api(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...options.headers
        }
    });

    const text = await response.text();

    let data;

    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(
            `Server returned HTML or invalid JSON. Check API route: ${url}`
        );
    }

    if (!response.ok) {
        throw new Error(data.error || "Something went wrong.");
    }

    return data;
}

// Create HTML elements safely
function makeElement(tag, className, text) {
  const element = document.createElement(tag);

  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;

  return element;
}

// Load companies
async function loadCompanies() {
  try {
    const companies = await api("/api/projects");
    const search = companySearch.value.toLowerCase().trim();

    companyList.replaceChildren();

    const filtered = companies.filter(company =>
      company.name.toLowerCase().includes(search)
    );

    if (filtered.length === 0) {
      companyList.textContent = "No companies found. Add one to get started.";
      return;
    }

    filtered.forEach(company => {
      const card = makeElement("article", "company-card");

      card.append(
        makeElement("h3", "", company.name),
        makeElement("p", "", company.description),
        makeElement(
          "span",
          "count",
          `${company.idea_count} feature requests →`
        )
      );

      card.addEventListener("click", () => {
        openCompany(company.id);
      });

      companyList.append(card);
    });

  } catch (error) {
    companyList.textContent = error.message;
  }
}

// Open a company's feedback board
async function openCompany(id) {
  try {
    currentProject = await api(`/api/projects/${id}`);

    homePage.hidden = true;
    companyBoard.hidden = false;

    document.getElementById("boardName").textContent =
      currentProject.name;

    document.getElementById("boardDescription").textContent =
      currentProject.description;

    const website = document.getElementById("boardWebsite");
    website.href = currentProject.url;

    document.getElementById("ideaTitle").value = "";
    document.getElementById("ideaDescription").value = "";
    document.getElementById("aiResult").hidden = true;

    await loadIdeas();

    window.scrollTo(0, 0);

  } catch (error) {
    alert(error.message);
  }
}

// Return to company list
document.getElementById("backBtn").addEventListener("click", () => {
  companyBoard.hidden = true;
  homePage.hidden = false;
  currentProject = null;
  window.scrollTo(0, 0);
});

// Load feature requests
async function loadIdeas() {
  if (!currentProject) return;

  const ideaList = document.getElementById("ideaList");

  try {
    const ideas = await api(
      `/api/projects/${currentProject.id}/ideas`
    );

    ideaList.replaceChildren();

    if (ideas.length === 0) {
      ideaList.textContent =
        "No feature requests yet. Be the first to suggest one!";
      return;
    }

    ideas.forEach(idea => {
      const card = makeElement("article", "idea-card");
      const content = makeElement("div");

      content.append(
        makeElement("h3", "", idea.title),
        makeElement("p", "", idea.description),
        makeElement("p", "small-note", `Status: ${idea.status}`)
      );

      const voteButton = makeElement(
        "button",
        "vote-btn",
        `▲ ${idea.votes}`
      );

      voteButton.type = "button";
      voteButton.title = "Vote for this feature";

      voteButton.addEventListener("click", async () => {
        voteButton.disabled = true;

        try {
          await api(`/api/ideas/${idea.id}/vote`, {
            method: "POST"
          });

          await loadIdeas();

        } catch (error) {
          alert(error.message);
          voteButton.disabled = false;
        }
      });

      card.append(content, voteButton);
      ideaList.append(card);
    });

  } catch (error) {
    ideaList.textContent = error.message;
  }
}

// Show add-company form
document.getElementById("showCompanyForm")
  .addEventListener("click", () => {
    companyForm.hidden = !companyForm.hidden;
  });

// Add a company
companyForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = document.getElementById("companyName").value.trim();
  const url = document.getElementById("companyUrl").value.trim();
  const description =
    document.getElementById("companyDescription").value.trim();

  const message = document.getElementById("companyMessage");

  try {
    await api("/api/projects", {
      method: "POST",
      body: JSON.stringify({ name, url, description })
    });

    companyForm.reset();
    companyForm.hidden = true;
    message.textContent = "";

    await loadCompanies();

  } catch (error) {
    message.textContent = error.message;
  }
});

// Search companies
companySearch.addEventListener("input", loadCompanies);

// AI duplicate finder
document.getElementById("checkIdeaBtn")
  .addEventListener("click", async () => {

    if (!currentProject) return;

    const title = document.getElementById("ideaTitle")
      .value.trim();

    const description = document.getElementById("ideaDescription")
      .value.trim();

    const checkButton = document.getElementById("checkIdeaBtn");
    const aiResult = document.getElementById("aiResult");
    const aiMessage = document.getElementById("aiMessage");
    const aiMethod = document.getElementById("aiMethod");
    const similarIdeas = document.getElementById("similarIdeas");
    const submitButton = document.getElementById("submitIdeaBtn");

    if (!title || !description) {
      alert("Please enter a feature title and description.");
      return;
    }

    checkButton.disabled = true;
    checkButton.textContent = "✨ AI is checking...";
    aiResult.hidden = false;
    aiMessage.textContent = "Comparing your idea with existing requests...";
    aiMethod.textContent = "";
    similarIdeas.replaceChildren();
    submitButton.hidden = true;

    try {
      const result = await api(
        `/api/projects/${currentProject.id}/check-idea`,
        {
          method: "POST",
          body: JSON.stringify({ title, description })
        }
      );

      aiMethod.textContent =
        result.method === "AI"
          ? "Checked using your local AI model."
          : result.method === "Basic matching"
            ? "Ollama was unavailable. Basic word matching was used instead."
            : "No previous requests to compare.";

      if (result.matches.length > 0) {
        aiMessage.textContent =
          "We found similar feature requests! You can support an existing idea instead of creating another one.";

        result.matches.forEach(idea => {
          const card = makeElement("div", "match-card");

          card.append(
            makeElement("h4", "", idea.title),
            makeElement("p", "", idea.description)
          );

          const voteButton = makeElement(
            "button",
            "vote-btn",
            `▲ ${idea.votes} · Vote`
          );

          voteButton.type = "button";

          voteButton.addEventListener("click", async () => {
            voteButton.disabled = true;

            try {
              await api(`/api/ideas/${idea.id}/vote`, {
                method: "POST"
              });

              await loadIdeas();
              voteButton.textContent = "✓ Voted";

            } catch (error) {
              alert(error.message);
              voteButton.disabled = false;
            }
          });

          card.append(voteButton);
          similarIdeas.append(card);
        });

        aiMessage.textContent +=
          " You can still submit your idea separately.";

      } else {
        aiMessage.textContent =
          "No similar request was found. Your idea is ready to be submitted.";
      }

      submitButton.hidden = false;

    } catch (error) {
      aiMessage.textContent = error.message;

    } finally {
      checkButton.disabled = false;
      checkButton.textContent = "✨ Check with AI";
    }
  });

// Submit a new feature request
document.getElementById("submitIdeaBtn")
  .addEventListener("click", async () => {

    if (!currentProject) return;

    const title = document.getElementById("ideaTitle")
      .value.trim();

    const description = document.getElementById("ideaDescription")
      .value.trim();

    try {
      await api(`/api/projects/${currentProject.id}/ideas`, {
        method: "POST",
        body: JSON.stringify({ title, description })
      });

      document.getElementById("ideaForm").reset();
      document.getElementById("aiResult").hidden = true;

      await loadIdeas();

      alert("Your feature request has been submitted!");

    } catch (error) {
      alert(error.message);
    }
  });

// Theme toggle
const themeBtn = document.getElementById("themeBtn");

if (localStorage.getItem("astuto-next-theme") === "dark") {
  document.body.classList.add("dark");
  themeBtn.textContent = "☀";
}

themeBtn.addEventListener("click", () => {
  document.body.classList.toggle("dark");

  const isDark = document.body.classList.contains("dark");

  localStorage.setItem(
    "astuto-next-theme",
    isDark ? "dark" : "light"
  );

  themeBtn.textContent = isDark ? "☀" : "☾";
});

// Start the app
loadCompanies();
// FEATURE CARD POPUP

const featureDetails = {
    "Company Feedback Boards": {
        icon: "🏢",
        description: "Explore different companies and view the feedback and suggestions shared by their users.",
        status: "Completed"
    },

    "Feature Requests": {
        icon: "💡",
        description: "Submit your ideas and suggestions to help companies improve their products.",
        status: "Completed"
    },

    "Community Voting": {
        icon: "👍",
        description: "Vote for feature requests you like and help popular ideas get noticed.",
        status: "Completed"
    },

    "AI Duplicate Finder": {
        icon: "🤖",
        description: "AI checks your suggestion against existing requests and helps you find similar ideas.",
        status: "In Progress"
    },

    "AI Feedback Analysis": {
        icon: "📊",
        description: "This planned feature will analyse feedback and identify common topics and patterns.",
        status: "Pending"
    },

    "Feedback Updates": {
        icon: "🔔",
        description: "This planned feature will notify users when the status of their requested features changes.",
        status: "Pending"
    }
};

// FEATURE CARD NAVIGATION

// OPEN COMPLETED FEATURES ON A NEW PAGE


document.getElementById("closeFeatureModal").addEventListener("click", () => {
    featureModal.style.display = "none";
});

// Close when clicking outside
featureModal.addEventListener("click", event => {
    if (event.target === featureModal) {
        featureModal.style.display = "none";
    }
});