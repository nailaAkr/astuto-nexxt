
const params = new URLSearchParams(window.location.search);
const feature = params.get("feature");

const pageTitle = document.getElementById("pageTitle");
const pageDescription = document.getElementById("pageDescription");
const companySelect = document.getElementById("companySelect");
const ideaSection = document.getElementById("ideaSection");
const ideasList = document.getElementById("ideasList");
const requestPanel = document.getElementById("requestPanel");
const message = document.getElementById("message");

let selectedCompany = null;

const featurePages = {
    companies: {
        title: "Company Feedback Boards",
        description: "Choose a company and explore its feedback board."
    },
    requests: {
        title: "Feature Requests",
        description: "Share your ideas and suggest improvements."
    },
    voting: {
        title: "Community Voting",
        description: "Support ideas you want companies to build."
    }
};

const currentFeature = featurePages[feature];

if (!currentFeature) {
    pageTitle.textContent = "Feature not found";
    pageDescription.textContent = "Please return to the home page.";
} else {
    pageTitle.textContent = currentFeature.title;
    pageDescription.textContent = currentFeature.description;

    const tryButton = document.getElementById("tryFeatureBtn");
    tryButton.href = `try-feature.html?feature=${feature}`;
}

// Show or hide sections depending on selected feature
if (feature === "companies") {
    requestPanel.style.display = "none";
} else if (feature === "voting") {
    requestPanel.style.display = "none";
}

// Load companies
async function loadCompanies() {
    try {
        const response = await fetch("/api/projects");
        const companies = await response.json();

        companySelect.innerHTML =
            '<option value="">Select a company</option>';

        companies.forEach(company => {
            const option = document.createElement("option");
            option.value = company.id;
            option.textContent = company.name;
            companySelect.appendChild(option);
        });

    } catch (error) {
        message.textContent = "Could not load companies.";
    }
}

// Select a company
companySelect.addEventListener("change", async () => {
    selectedCompany = companySelect.value;

    if (!selectedCompany) {
        ideaSection.style.display = "none";
        return;
    }

    ideaSection.style.display = "block";
    await loadIdeas();
});

// Load ideas
async function loadIdeas() {
    try {
        const response = await fetch(
            `/api/projects/${selectedCompany}/ideas`
        );

        const ideas = await response.json();
        ideasList.innerHTML = "";

        if (ideas.length === 0) {
            ideasList.textContent = "No ideas yet. Be the first!";
            return;
        }

        ideas.forEach(idea => {
            const card = document.createElement("div");
            card.className = "idea-card";

            const title = document.createElement("h3");
            title.textContent = idea.title;

            const description = document.createElement("p");
            description.textContent = idea.description;

            const votes = document.createElement("p");
            votes.textContent = `👍 ${idea.votes || 0} votes`;

            card.append(title, description, votes);

            if (feature === "voting") {
                const voteButton = document.createElement("button");
                voteButton.textContent = "Vote for this idea";

                voteButton.addEventListener("click", async () => {
                    await voteForIdea(idea.id);
                });

                card.appendChild(voteButton);
            }

            ideasList.appendChild(card);
        });

    } catch (error) {
        ideasList.textContent = "Could not load ideas.";
    }
}

// Vote for an idea
async function voteForIdea(id) {
    try {
        const response = await fetch(`/api/ideas/${id}/vote`, {
            method: "POST"
        });

        if (!response.ok) {
            throw new Error("Voting failed");
        }

        message.textContent = "Your vote was added!";
        await loadIdeas();

    } catch (error) {
        message.textContent = "Could not submit your vote.";
    }
}

// Submit a new feature request
document.getElementById("requestForm")
    .addEventListener("submit", async event => {

        event.preventDefault();

        if (!selectedCompany) return;

        const title = document.getElementById("requestTitle").value;
        const description =
            document.getElementById("requestDescription").value;

        try {
            const response = await fetch(
                `/api/projects/${selectedCompany}/ideas`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ title, description })
                }
            );

            if (!response.ok) {
                throw new Error("Submission failed");
            }

            message.textContent = "Your idea was submitted!";
            event.target.reset();
            await loadIdeas();

        } catch (error) {
            message.textContent = "Could not submit your idea.";
        }
    });

loadCompanies();
