import http from "k6/http";
import { check, sleep } from "k6";

/**
 * KanzleiFlow Multi-Tenant Scalability Load Test (k6)
 * Simulates concurrent authenticated load across notary offices.
 */

// Signed session token for usr_notary_weiss_01
const SESSION_TOKEN = __ENV.SESSION_TOKEN || "eyJ1c2VySWQiOiJ1c3Jfbm90YXJ5X3dlaXNzXzAxIiwiZW1haWwiOiJqLndlaXNzQG5vdGFyaWF0LXdlaXNzLXBhcnRuZXIuZGUiLCJmdWxsTmFtZSI6IkRyLiBKb2hhbm5lcyBXZWlzcyIsImlzc3VlZEF0IjoxNzkxNzgyNTExMzU2LCJleHBpcmVzQXQiOjE3OTE4MTEzMTEzNTZ9.6zo5NsI2hWC5Y80qr_rKk-_J_7mEmGi-u5FdfjbJ81Y";

export const options = {
  scenarios: {
    // 1. Authenticated Case Listing and Search
    case_listing: {
      executor: "constant-vus",
      vus: 20,
      duration: "10s",
      exec: "caseListingScenario",
    },
    // 2. Case Detail API
    case_detail: {
      executor: "constant-vus",
      vus: 15,
      duration: "10s",
      exec: "caseDetailScenario",
    },
    // 3. Health & Readiness Probes
    readiness_probes: {
      executor: "constant-vus",
      vus: 10,
      duration: "10s",
      exec: "readinessScenario",
    },
  },
  thresholds: {
    http_req_duration: ["p(50)<500", "p(95)<1000"],
    http_req_failed: ["rate<0.05"], // Less than 5% failure under load
  },
};

const BASE_URL = __ENV.TARGET_URL || "http://localhost:3000";

const AUTH_HEADERS = {
  "Cookie": `kanzleiflow_session=${SESSION_TOKEN}`,
  "Accept": "application/json",
};

export function caseListingScenario() {
  const searchTerms = ["München", "Grundstück", "Kaufvertrag", "Schwabing", "Weber"];
  const search = searchTerms[Math.floor(Math.random() * searchTerms.length)];

  const res = http.get(`${BASE_URL}/cases?search=${encodeURIComponent(search)}`, {
    headers: {
      "Cookie": `kanzleiflow_session=${SESSION_TOKEN}`,
      "Accept": "text/html",
    },
  });

  check(res, {
    "case listing 200": (r) => r.status === 200,
  });

  sleep(0.1);
}

export function caseDetailScenario() {
  const res = http.get(`${BASE_URL}/api/cases/case_demo_01`, {
    headers: AUTH_HEADERS,
  });

  check(res, {
    "case detail 200 or valid": (r) => r.status === 200 || r.status === 404,
  });

  sleep(0.1);
}

export function readinessScenario() {
  const res = http.get(`${BASE_URL}/api/ready`, {
    headers: { "Accept": "application/json" },
  });

  check(res, {
    "readiness 200": (r) => r.status === 200,
    "db is connected": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.database && body.database.connected === true;
      } catch {
        return false;
      }
    },
  });

  sleep(0.1);
}
