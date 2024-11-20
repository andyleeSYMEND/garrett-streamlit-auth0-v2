import { Streamlit } from "streamlit-component-lib"
import createAuth0Client from '@auth0/auth0-spa-js';
import "./style.css"

const div = document.body.appendChild(document.createElement("div"))
const button = div.appendChild(document.createElement("button"))
button.className = "log"
button.textContent = "Login"

// set flex collumn so the error message appears under the button
div.style = "display: flex; flex-direction: column; color: rgb(104, 85, 224); font-weight: 600; margin: 0; padding: 10px"
const errorNode = div.appendChild(document.createTextNode(""))

// Global vars
let client_id
let domain
let audience
let debug_logs
let auth0

let masterToken = null;
let platformToken = null;
let orgToken = null;
let refreshToken = null;

const getOriginUrl = () => {
  // Detect if you're inside an iframe
  if (window.parent !== window) {
    const currentIframeHref = new URL(document.location.href)
    const urlOrigin = currentIframeHref.origin
    const urlFilePath = decodeURIComponent(currentIframeHref.pathname)
    // Take referrer as origin
    return urlOrigin + urlFilePath
  } else {
    return window.location.origin
  }
}

const createClient = async () => {
  if (auth0) return;

  auth0 = await createAuth0Client({
    domain: domain,
    client_id: client_id,
    redirect_uri: getOriginUrl(),
    audience: audience,
    useRefreshTokens: true,
    cacheLocation: "localstorage"
  });
}

const getScopedToken = async (scopeType, organizationId = null) => {
  try {
    const scope = 
      scopeType === "master"
        ? "openid profile email offline_access mode:context context:tbd"
        : scopeType === "platform"
        ? "openid profile email offline_access mode:context context:platform"
        : scopeType === "organization" && organizationId
        ? `openid profile email offline_access mode:context context:${organizationId}`
        : null;

    if (!scope) {
      throw new Error(`Invalid scope type or missing organization ID for scopeType: ${scopeType}`);
    }

    const token = await auth0.getTokenSilently({
      audience: audience,
      scope: scope,
    });

    console.log(`Token for ${scopeType} scope:`, token);
    return token;
  } catch (error) {
    console.error(`Error fetching scoped token for ${scopeType}:`, error);
    throw error;
  }
};

  const logout = async () => {

  await createClient();

  auth0.logout({ returnTo: getOriginUrl() })


  Streamlit.setComponentValue(null)
  button.textContent = "Login"
  button.removeEventListener('click', logout)
  button.addEventListener('click', login)
}

const login = async () => {
  button.textContent = "working...";
  await createClient();

  try {
    await auth0.loginWithPopup();
    errorNode.textContent = "";
  } catch (err) {
    console.error("Login failed:", err);
    errorNode.textContent = `Popup blocked, please try again or enable popups` + String.fromCharCode(160);
    return;
  }

  try {
    const user = await auth0.getUser();

    // Fetch tokens for different scopes
    const masterToken = await getScopedToken("master");
    const platformToken = await getScopedToken("platform");
    const orgToken = await getScopedToken("organization", "your-organization-id");

    // Get refresh token
    const refreshToken = await auth0.getTokenSilently({
      audience: audience,
      scope: "offline_access",  // Ensure refresh tokens are granted
    });

    const userCopy = {
      ...user,
      masterToken,
      platformToken,
      orgToken,
      refreshToken,
    };

    if (debug_logs) {
      console.log("Fetched user and tokens:", userCopy);
    }

    Streamlit.setComponentValue(userCopy);
  } catch (error) {
    console.error("Failed to get tokens:", error);
    Streamlit.setComponentValue(null);
  }

  button.textContent = "Logout";
  button.removeEventListener("click", login);
  button.addEventListener("click", logout);
};

const resume = async () => {
  if (debug_logs) {
    console.log(
      "Resuming session\n" +
      "Configuration:\n" +
      "  Client Id:" + client_id + "\n" +
      "  Domain:", domain + "\n" +
      "  Audience:", audience + "\n" +
      "  Callback urls set to: ", getOriginUrl() + "\n"
    );
  }

  button.textContent = "working...";
  await createClient();

  if (await auth0.isAuthenticated()) {
    const user = await auth0.getUser();

    try {
      // Fetch scoped tokens during session resumption
      const masterToken = await getScopedToken("master");
      const platformToken = await getScopedToken("platform");

      // If multiple organization IDs, loop or dynamically fetch the active one
      const organizationId = "your-organization-id"; // Replace with dynamic logic if applicable
      const orgToken = await getScopedToken("organization", organizationId);

      const refreshToken = await auth0.getTokenSilently({
        audience: audience,
        scope: "offline_access",
      });

      const userCopy = {
        ...user,
        masterToken,
        platformToken,
        orgToken,
        refreshToken,
      };

      if (debug_logs) {
        console.log("Resumed user data with tokens:", userCopy);
      }

      Streamlit.setComponentValue(userCopy);
    } catch (error) {
      console.error("Failed to resume session and fetch tokens:", error);
      Streamlit.setComponentValue(null);
    }

    button.textContent = "Logout";
    button.removeEventListener("click", login);
    button.addEventListener("click", logout);
  } else {
    button.textContent = "Login";
    button.removeEventListener("click", logout);
    button.addEventListener("click", login);
  }
};

async function onRender(event) {
  const data = event.detail

  client_id = data.args["client_id"]
  domain = data.args["domain"]
  audience = data.args["audience"]
  debug_logs = data.args["debug_logs"]

  if (!auth0) { // first time or page refreshed
    await createClient();
    if (await auth0.isAuthenticated()) { // page refreshed
      await resume();
    }
  } else {
    // streamlit rerendered
    if (!await auth0.isAuthenticated()) { // sig expired

        button.removeEventListener('click', login);
        button.removeEventListener('click', logout);

        button.textContent = "Login"
        button.addEventListener('click', login)

    }
  }

  Streamlit.setFrameHeight()
}

Streamlit.events.addEventListener(Streamlit.RENDER_EVENT, onRender)
Streamlit.setComponentReady()
