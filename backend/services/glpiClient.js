const axios = require('axios');
require('dotenv').config();

const BASE_URL = process.env.GLPI_BASE_URL; // e.g. https://glpi.example.com/apirest.php
const APP_TOKEN = process.env.GLPI_APP_TOKEN;

function assertConfig() {
  if (!BASE_URL || !APP_TOKEN) throw new Error('GLPI_BASE_URL and GLPI_APP_TOKEN must be set in env');
}

async function loginWithCredentials(login, password) {
  assertConfig();
  if (!login || !password) throw new Error('login and password required');
  const url = `${BASE_URL.replace(/\/$/, '')}/initSession`;
  try {
    const resp = await axios.post(url, { login, password }, { headers: { 'App-Token': APP_TOKEN, 'Content-Type': 'application/json' } });
    const token = resp.data?.session_token || resp.data?.session?.session_token;
    if (!token) throw new Error('GLPI did not return session_token');
    return token;
  } catch (err) {
    // try legacy GET fallback
    try {
      const urlLegacy = `${BASE_URL.replace(/\/$/, '')}/initSession?login=${encodeURIComponent(login)}&password=${encodeURIComponent(password)}`;
      const resp2 = await axios.get(urlLegacy, { headers: { 'App-Token': APP_TOKEN } });
      const token2 = resp2.data?.session_token || resp2.data?.session?.session_token;
      if (!token2) throw err;
      return token2;
    } catch (e) {
      throw e;
    }
  }
}

async function killSession(sessionToken) {
  assertConfig();
  if (!sessionToken) return;
  const url = `${BASE_URL.replace(/\/$/, '')}/killSession`;
  try {
    await axios.get(url, { headers: { 'App-Token': APP_TOKEN, 'Session-Token': sessionToken } });
    return true;
  } catch (err) {
    // swallow
    return false;
  }
}

// GET /getFullSession - returns user profile and active entities
async function getUserProfile(sessionToken) {
  assertConfig();
  if (!sessionToken) throw new Error('session token required');
  const url = `${BASE_URL.replace(/\/$/, '')}/getFullSession`;
  try {
    const resp = await axios.get(url, { headers: { 'App-Token': APP_TOKEN, 'Session-Token': sessionToken } });
    return resp.data;
  } catch (err) {
    throw new Error(`Failed to get user profile: ${err.message}`);
  }
}

// GET /getMyEntities - returns entities the logged user has access to
async function getMyEntities(sessionToken) {
  assertConfig();
  if (!sessionToken) throw new Error('session token required');
  const url = `${BASE_URL.replace(/\/$/, '')}/getMyEntities`;
  try {
    const resp = await axios.get(url, { headers: { 'App-Token': APP_TOKEN, 'Session-Token': sessionToken }, params: { is_recursive: true } });
    // Response format: { "myentities": [ {"id": 1, "name": "...", ...}, ... ] }
    return resp.data?.myentities || [];
  } catch (err) {
    throw new Error(`Failed to get user entities: ${err.message}`);
  }
}

module.exports = { loginWithCredentials, killSession, getUserProfile, getMyEntities };
