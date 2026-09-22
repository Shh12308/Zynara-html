/* =========================================================
   HELOXAI SOC
   Security Operations Dashboard
   ========================================================= */


// =========================================================
// ENVIRONMENT
// =========================================================

if (!window.__ENV__) {
  throw new Error("env.js was not loaded.");
}


const ENV = window.__ENV__;


if (!ENV.SUPABASE_URL) {
  throw new Error("SUPABASE_URL is missing.");
}


if (!ENV.SUPABASE_ANON_KEY) {
  throw new Error("SUPABASE_ANON_KEY is missing.");
}


// =========================================================
// SUPABASE
// =========================================================

const supabaseClient =
  window.supabase.createClient(
    ENV.SUPABASE_URL,
    ENV.SUPABASE_ANON_KEY
  );


// =========================================================
// STATE
// =========================================================

const state = {

  events: [],

  totalEvents: 0,

  alerts: 0,

  critical: 0,

  loginSuccess: 0,

  loginFailures: 0,

  isAdmin: false,

  eventBuckets: Array(24).fill(0),

  alertBuckets: Array(24).fill(0)

};


// =========================================================
// DOM
// =========================================================

const $ = id =>
  document.getElementById(id);


const logs =
  $("logs");

const eventCount =
  $("eventCount");

const alertCount =
  $("alertCount");

const criticalCount =
  $("criticalCount");

const loginSuccess =
  $("loginSuccess");

const loginFailures =
  $("loginFailures");

const adminStatus =
  $("adminStatus");

const adminMessage =
  $("adminMessage");

const connectionText =
  $("connectionText");

const connectionDot =
  $("connectionDot");

const dbHealth =
  $("dbHealth");

const realtimeHealth =
  $("realtimeHealth");

const backendHealth =
  $("backendHealth");

const freeAIHealth =
  $("freeAIHealth");

const premiumAIHealth =
  $("premiumAIHealth");

const eventChart =
  $("eventChart");

const alertChart =
  $("alertChart");


// =========================================================
// CLOCK
// =========================================================

function updateClock() {

  const clock =
    $("clock");

  if (!clock) {
    return;
  }

  clock.textContent =
    new Date().toLocaleTimeString(
      [],
      {
        hour12: false
      }
    );

}


setInterval(
  updateClock,
  1000
);

updateClock();


// =========================================================
// LOGGING
// =========================================================

function addSystemMessage(
  message,
  severity = "info"
) {

  addLog({

    id:
      `system-${Date.now()}-${Math.random()}`,

    created_at:
      new Date().toISOString(),

    event_type:
      "SYSTEM",

    severity,

    message,

    source:
      "HeloXAi"

  });

}


function addLog(event) {

  if (!event) {
    return;
  }


  state.totalEvents++;


  if (
    event.severity === "warning" ||
    event.severity === "critical"
  ) {

    state.alerts++;

  }


  if (
    event.severity === "critical"
  ) {

    state.critical++;

  }


  const type =
    String(
      event.event_type || ""
    ).toUpperCase();


  if (
    type.includes("LOGIN") &&
    (
      type.includes("SUCCESS") ||
      type.includes("SUCCESSFUL")
    )
  ) {

    state.loginSuccess++;

  }


  if (
    type.includes("LOGIN") &&
    (
      type.includes("FAIL") ||
      type.includes("FAILED")
    )
  ) {

    state.loginFailures++;

  }


  updateMetrics();


  updateActivityBuckets(
    event
  );


  const row =
    document.createElement("div");

  row.className =
    "log";


  const date =
    new Date(
      event.created_at ||
      Date.now()
    );


  const time =
    date.toLocaleTimeString(
      [],
      {
        hour12: false
      }
    );


  let severityClass =
    "sev-info";


  if (
    event.severity === "warning"
  ) {

    severityClass =
      "sev-warning";

  }


  if (
    event.severity === "critical"
  ) {

    severityClass =
      "sev-critical";

  }


  const timeEl =
    document.createElement("span");

  timeEl.className =
    "time";

  timeEl.textContent =
    `[${time}]`;


  const typeEl =
    document.createElement("span");

  typeEl.className =
    `type ${severityClass}`;

  typeEl.textContent =
    event.event_type ||
    "EVENT";


  const messageEl =
    document.createElement("span");

  messageEl.className =
    "message";

  messageEl.textContent =
    event.message ||
    "Security event";


  row.appendChild(
    timeEl
  );

  row.appendChild(
    document.createTextNode(" ")
  );

  row.appendChild(
    typeEl
  );

  row.appendChild(
    document.createTextNode(" ")
  );

  row.appendChild(
    messageEl
  );


  if (event.source) {

    const sourceEl =
      document.createElement("span");

    sourceEl.className =
      "source";

    sourceEl.textContent =
      ` // ${event.source}`;

    row.appendChild(
      sourceEl
    );

  }


  logs.appendChild(
    row
  );


  logs.scrollTop =
    logs.scrollHeight;

}


// =========================================================
// METRICS
// =========================================================

function updateMetrics() {

  eventCount.textContent =
    state.totalEvents;

  alertCount.textContent =
    state.alerts;

  criticalCount.textContent =
    state.critical;

  loginSuccess.textContent =
    state.loginSuccess;

  loginFailures.textContent =
    state.loginFailures;

}


// =========================================================
// CHART DATA
// =========================================================

function updateActivityBuckets(
  event
) {

  const date =
    new Date(
      event.created_at ||
      Date.now()
    );


  const hour =
    date.getHours();


  state.eventBuckets[hour]++;


  if (
    event.severity === "warning" ||
    event.severity === "critical"
  ) {

    state.alertBuckets[hour]++;

  }


  renderCharts();

}


function renderBars(
  element,
  values
) {

  if (!element) {
    return;
  }


  element.innerHTML = "";


  const max =
    Math.max(
      1,
      ...values
    );


  values.forEach(
    value => {

      const bar =
        document.createElement("div");

      bar.className =
        "bar";


      const height =
        Math.max(
          4,
          (value / max) * 90
        );


      bar.style.height =
        `${height}px`;


      bar.title =
        `${value} events`;


      element.appendChild(
        bar
      );

    }
  );

}


function renderCharts() {

  renderBars(
    eventChart,
    state.eventBuckets
  );


  renderBars(
    alertChart,
    state.alertBuckets
  );

}


// =========================================================
// LOAD EVENTS
// =========================================================

async function loadEvents() {

  const {
    data,
    error
  } =
    await supabaseClient
      .from("security_events")
      .select("*")
      .order(
        "created_at",
        {
          ascending: false
        }
      )
      .limit(200);


  if (error) {

    addSystemMessage(
      "Unable to load security telemetry: " +
      error.message,
      "critical"
    );

    setHealth(
      dbHealth,
      "ERROR",
      "bad"
    );

    return;

  }


  state.events =
    data || [];


  /*
    Reset statistics because we're rebuilding
    them from the database.
  */

  state.totalEvents = 0;
  state.alerts = 0;
  state.critical = 0;
  state.loginSuccess = 0;
  state.loginFailures = 0;

  state.eventBuckets =
    Array(24).fill(0);

  state.alertBuckets =
    Array(24).fill(0);


  /*
    Clear existing generated logs,
    keeping boot messages.
  */

  logs.innerHTML = "";


  data
    .reverse()
    .forEach(
      event => addLog(event)
    );


  setHealth(
    dbHealth,
    "ONLINE",
    "good"
  );

}


// =========================================================
// HEALTH STATUS
// =========================================================

function setHealth(
  element,
  text,
  status
) {

  if (!element) {
    return;
  }


  element.textContent =
    text;


  element.className =
    "health-status";


  if (status === "bad") {

    element.classList.add(
      "bad"
    );

  }


  if (status === "warn") {

    element.classList.add(
      "warn"
    );

  }

}


// =========================================================
// BACKEND HEALTH
// =========================================================

async function checkEndpoint(
  url,
  element
) {

  if (!url) {

    setHealth(
      element,
      "NOT CONFIGURED",
      "warn"
    );

    return;

  }


  try {

    const start =
      performance.now();


    const response =
      await fetch(
        url,
        {
          method: "GET",
          cache: "no-store"
        }
      );


    const duration =
      Math.round(
        performance.now() -
        start
      );


    if (
      response.ok
    ) {

      setHealth(
        element,
        `${response.status} / ${duration}ms`,
        "good"
      );

    } else {

      setHealth(
        element,
        `${response.status}`,
        "warn"
      );

    }

  } catch (error) {

    /*
      A CORS restriction can appear as a network
      error even when the server itself is running.
    */

    setHealth(
      element,
      "UNREACHABLE",
      "bad"
    );

  }

}


// =========================================================
// ALL HEALTH CHECKS
// =========================================================

async function healthCheck() {

  await checkEndpoint(
    ENV.BACKEND_URL,
    backendHealth
  );


  await checkEndpoint(
    ENV.FREE_AI_URL,
    freeAIHealth
  );


  await checkEndpoint(
    ENV.PREMIUM_AI_URL,
    premiumAIHealth
  );

}


// =========================================================
// AUTH / ADMIN
// =========================================================

async function checkAdmin() {

  const {
    data: {
      user
    }
  } =
    await supabaseClient.auth.getUser();


  if (!user) {

    state.isAdmin = false;

    adminStatus.textContent =
      "NOT SIGNED IN";

    adminStatus.className =
      "metric-value red";

    adminMessage.textContent =
      "Administrator authentication required.";

    return;

  }


  const {
    data,
    error
  } =
    await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();


  if (
    error ||
    !data ||
    data.role !== "admin"
  ) {

    state.isAdmin = false;

    adminStatus.textContent =
      "USER";

    adminStatus.className =
      "metric-value yellow";

    adminMessage.textContent =
      "Signed in, but administrator privileges are not present.";

    disableAdminControls();

    return;

  }


  state.isAdmin = true;

  adminStatus.textContent =
    "ADMIN";

  adminStatus.className =
    "metric-value";

  adminMessage.textContent =
    `Administrator verified: ${user.email}`;

  enableAdminControls();

}


// =========================================================
// ADMIN CONTROLS
// =========================================================

function enableAdminControls() {

  $("testAlertButton").disabled =
    false;

}


function disableAdminControls() {

  $("testAlertButton").disabled =
    true;

}


// =========================================================
// CREATE TEST ALERT
// =========================================================

async function createTestAlert() {

  if (!state.isAdmin) {

    addSystemMessage(
      "Administrator permission required.",
      "warning"
    );

    return;

  }


  const {
    error
  } =
    await supabaseClient
      .from("security_events")
      .insert({

        event_type:
          "ADMIN_TEST",

        severity:
          "warning",

        message:
          "Administrator created a test security alert.",

        source:
          "SOC Console"

      });


  if (error) {

    addSystemMessage(
      "Unable to create test alert: " +
      error.message,
      "critical"
    );

  }

}


// =========================================================
// CLEAR TERMINAL
// =========================================================

function clearTerminal() {

  logs.innerHTML = "";

  addSystemMessage(
    "Terminal display cleared.",
    "info"
  );

}


// =========================================================
// REALTIME
// =========================================================

const securityChannel =
  supabaseClient
    .channel(
      "helixai-security-events"
    )

    .on(

      "postgres_changes",

      {
        event: "INSERT",
        schema: "public",
        table: "security_events"
      },

      payload => {

        addLog(
          payload.new
        );

      }

    )

    .subscribe(
      status => {

        console.log(
          "Realtime:",
          status
        );


        if (
          status === "SUBSCRIBED"
        ) {

          setHealth(
            realtimeHealth,
            "LIVE",
            "good"
          );


          connectionText.textContent =
            "SUPABASE LIVE";


          connectionDot.classList.add(
            "online"
          );

        }


        else if (
          status === "CHANNEL_ERROR"
        ) {

          setHealth(
            realtimeHealth,
            "ERROR",
            "bad"
          );


          connectionText.textContent =
            "REALTIME ERROR";


          connectionDot.classList.remove(
            "online"
          );

        }


        else {

          setHealth(
            realtimeHealth,
            status,
            "warn"
          );

        }

      }
    );


// =========================================================
// BUTTONS
// =========================================================

$("refreshButton")
  .addEventListener(
    "click",
    async () => {

      addSystemMessage(
        "Refreshing security telemetry..."
      );

      await loadEvents();

      await healthCheck();

      await checkAdmin();

      addSystemMessage(
        "Telemetry refresh complete."
      );

    }
  );


$("testAlertButton")
  .addEventListener(
    "click",
    createTestAlert
  );


$("clearButton")
  .addEventListener(
    "click",
    clearTerminal
  );


// =========================================================
// AUTH STATE
// =========================================================

supabaseClient.auth
  .onAuthStateChange(
    () => {

      /*
        Delay the database query slightly so Supabase
        has completed the session transition.
      */

      setTimeout(
        checkAdmin,
        100
      );

    }
  );


// =========================================================
// INITIALIZATION
// =========================================================

async function initialize() {

  renderCharts();


  await checkAdmin();


  await loadEvents();


  await healthCheck();


  addSystemMessage(
    "HeloXAi SOC online.",
    "info"
  );

}


initialize();


// =========================================================
// PERIODIC HEALTH CHECK
// =========================================================

setInterval(
  healthCheck,
  60000
);


// =========================================================
// CLEANUP
// =========================================================

window.addEventListener(
  "beforeunload",
  () => {

    supabaseClient.removeChannel(
      securityChannel
    );

  }
);