/* =========================================================
   Mealmate — Meal Rate Management
   File: js/meal-rates.js

   Responsibilities:
   - Resolve current Mess
   - Load current Meal Rate
   - Load Rate History
   - Save new Rate version
   - Validate effective date
   - Protect historical Rate records

   Live database contract:
   meal_rates
   - id
   - mess_id
   - effective_date
   - day_rate
   - night_rate
   - full_rate
   - guest_rate
   - friday_feast_rate
   - created_at
   - updated_at
   ========================================================= */

import {
  supabase,
  getCurrentUser,
} from "./supabase.js";


/* =========================================================
   STATE
   ========================================================= */

const state = {
  user: null,
  mess: null,
  rates: [],
};


/* =========================================================
   DOM
   ========================================================= */

const dom = {
  messName:
    document.querySelector(
      '[data-settings="mess-name"]'
    ),

  roomRange:
    document.querySelector(
      '[data-settings="room-range"]'
    ),

  borderCount:
    document.querySelector(
      '[data-settings="border-count"]'
    ),

  currency:
    document.querySelector(
      '[data-settings="currency"]'
    ),

  currentDate:
    document.querySelector(
      "[data-rates-current-date]"
    ),

  currentDay:
    document.querySelector(
      '[data-rate="day"]'
    ),

  currentNight:
    document.querySelector(
      '[data-rate="night"]'
    ),

  currentFull:
    document.querySelector(
      '[data-rate="full"]'
    ),

  currentGuest:
    document.querySelector(
      '[data-rate="guest"]'
    ),

  currentFeast:
    document.querySelector(
      '[data-rate="feast"]'
    ),

  form:
    document.querySelector(
      "[data-rate-form]"
    ),

  history:
    document.querySelector(
      "[data-rates-history]"
    ),

  historyCount:
    document.querySelector(
      "[data-rates-history-count]"
    ),

  formError:
    document.querySelector(
      "[data-rate-form-error]"
    ),

  effectiveDate:
    document.querySelector(
      '[data-rate-input="effective-date"]'
    ),

  day:
    document.querySelector(
      '[data-rate-input="day"]'
    ),

  night:
    document.querySelector(
      '[data-rate-input="night"]'
    ),

  full:
    document.querySelector(
      '[data-rate-input="full"]'
    ),

  guest:
    document.querySelector(
      '[data-rate-input="guest"]'
    ),

  feast:
    document.querySelector(
      '[data-rate-input="feast"]'
    ),

  reset:
    document.querySelector(
      '[data-rate-action="reset"]'
    ),

  save:
    document.querySelector(
      '[data-rate-action="save"]'
    ),
};


/* =========================================================
   START
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  initializeMealRates
);


/* =========================================================
   PAGE CHECK
   ========================================================= */

function isSettingsPage() {

  return window.location.pathname
    .replace(/\\/g, "/")
    .endsWith(
      "/pages/settings.html"
    );
}


/* =========================================================
   INITIALIZE
   ========================================================= */

async function initializeMealRates() {

  if (!isSettingsPage()) {
    return;
  }


  try {

    const user =
      await getCurrentUser();


    if (!user) {

      redirectToLogin();

      return;
    }


    state.user =
      user;


    setTodayAsDefault();


    bindEvents();


    await loadCurrentMess();


    if (!state.mess) {

      renderNoMess();

      return;
    }


    await loadRates();


    renderSettings();

  } catch (error) {

    console.error(
      "[Mealmate] Meal rates initialization error:",
      error
    );


    showFormError(
      getFriendlyError(error)
    );
  }
}


/* =========================================================
   LOAD CURRENT MESS
   ========================================================= */

async function loadCurrentMess() {

  const userId =
    state.user?.id;


  if (!userId) {
    return;
  }


  /*
   * Multiple test Mess records may exist.
   * Prefer the Mess with the most active members,
   * then newest Mess.
   */

  const {
    data: messes,
    error: messError,
  } = await supabase
    .from("mess")
    .select(`
      id,
      name,
      room_start,
      room_end,
      border_count,
      created_at
    `)
    .eq(
      "created_by",
      userId
    )
    .order(
      "created_at",
      {
        ascending: false,
      }
    );


  if (messError) {
    throw messError;
  }


  if (
    !Array.isArray(messes) ||
    !messes.length
  ) {

    state.mess =
      null;

    return;
  }


  const messIds =
    messes
      .map(
        (mess) => mess.id
      )
      .filter(Boolean);


  const {
    data: members,
    error: membersError,
  } = await supabase
    .from("members")
    .select(`
      id,
      mess_id,
      active
    `)
    .in(
      "mess_id",
      messIds
    );


  if (membersError) {
    throw membersError;
  }


  const memberCount =
    new Map();


  for (
    const member of
      members ?? []
  ) {

    if (!member.active) {
      continue;
    }


    memberCount.set(
      member.mess_id,
      (
        memberCount.get(
          member.mess_id
        ) ?? 0
      ) + 1
    );
  }


  const sorted =
    [...messes].sort(
      (a, b) => {

        const countA =
          memberCount.get(
            a.id
          ) ?? 0;

        const countB =
          memberCount.get(
            b.id
          ) ?? 0;


        if (
          countA !== countB
        ) {

          return (
            countB - countA
          );
        }


        return (
          new Date(
            b.created_at ?? 0
          ) -
          new Date(
            a.created_at ?? 0
          )
        );
      }
    );


  state.mess =
    sorted[0] ?? null;
}


/* =========================================================
   LOAD RATES
   ========================================================= */

async function loadRates() {

  if (!state.mess?.id) {
    return;
  }


  const {
    data,
    error,
  } = await supabase
    .from("meal_rates")
    .select(`
      id,
      mess_id,
      effective_date,
      day_rate,
      night_rate,
      full_rate,
      guest_rate,
      friday_feast_rate,
      created_at,
      updated_at
    `)
    .eq(
      "mess_id",
      state.mess.id
    )
    .order(
      "effective_date",
      {
        ascending: false,
      }
    );


  if (error) {
    throw error;
  }


  state.rates =
    data ?? [];
}


/* =========================================================
   RENDER SETTINGS
   ========================================================= */

function renderSettings() {

  renderMessInfo();

  renderCurrentRate();

  renderRateHistory();
}


/* =========================================================
   MESS INFO
   ========================================================= */

function renderMessInfo() {

  if (!state.mess) {
    return;
  }


  if (dom.messName) {

    dom.messName.textContent =
      state.mess.name;
  }


  if (dom.roomRange) {

    dom.roomRange.textContent =
      `${state.mess.room_start} — ${state.mess.room_end}`;
  }


  if (dom.borderCount) {

    dom.borderCount.textContent =
      String(
        state.mess.border_count ?? 0
      );
  }


  if (dom.currency) {

    dom.currency.textContent =
      "BDT";
  }
}


/* =========================================================
   CURRENT RATE
   ========================================================= */

function renderCurrentRate() {

  const today =
    getTodayDateString();


  const currentRate =
    state.rates.find(
      (rate) =>
        rate.effective_date <=
        today
    );


  if (!currentRate) {

    setMoney(
      dom.currentDay,
      0
    );

    setMoney(
      dom.currentNight,
      0
    );

    setMoney(
      dom.currentFull,
      0
    );

    setMoney(
      dom.currentGuest,
      0
    );

    setMoney(
      dom.currentFeast,
      0
    );


    if (dom.currentDate) {

      dom.currentDate.textContent =
        "No active rate";
    }


    return;
  }


  setMoney(
    dom.currentDay,
    currentRate.day_rate
  );

  setMoney(
    dom.currentNight,
    currentRate.night_rate
  );

  setMoney(
    dom.currentFull,
    currentRate.full_rate
  );

  setMoney(
    dom.currentGuest,
    currentRate.guest_rate
  );

  setMoney(
    dom.currentFeast,
    currentRate.friday_feast_rate
  );


  if (dom.currentDate) {

    dom.currentDate.textContent =
      formatDate(
        currentRate.effective_date
      );
  }
}


/* =========================================================
   RATE HISTORY
   ========================================================= */

function renderRateHistory() {

  if (!dom.history) {
    return;
  }


  if (dom.historyCount) {

    dom.historyCount.textContent =
      String(
        state.rates.length
      );
  }


  if (!state.rates.length) {

    dom.history.innerHTML = `
      <tr>
        <td
          colspan="6"
          class="table-empty"
        >
          এখনো কোনো Rate সংরক্ষণ করা হয়নি।
        </td>
      </tr>
    `;

    return;
  }


  dom.history.innerHTML =
    state.rates
      .map(
        renderRateRow
      )
      .join("");
}


/* =========================================================
   RATE ROW
   ========================================================= */

function renderRateRow(
  rate
) {

  return `
    <tr>

      <td>
        ${escapeHtml(
          formatDate(
            rate.effective_date
          )
        )}
      </td>

      <td>
        ${formatMoneyCell(
          rate.day_rate
        )}
      </td>

      <td>
        ${formatMoneyCell(
          rate.night_rate
        )}
      </td>

      <td>
        ${formatMoneyCell(
          rate.full_rate
        )}
      </td>

      <td>
        ${formatMoneyCell(
          rate.guest_rate
        )}
      </td>

      <td>
        ${formatMoneyCell(
          rate.friday_feast_rate
        )}
      </td>

    </tr>
  `;
}


/* =========================================================
   FORM EVENTS
   ========================================================= */

function bindEvents() {

  dom.form?.addEventListener(
    "submit",
    handleFormSubmit
  );


  dom.reset?.addEventListener(
    "click",
    () => {

      clearFormError();

      window.setTimeout(
        setTodayAsDefault,
        0
      );
    }
  );
}


/* =========================================================
   FORM SUBMIT
   ========================================================= */

async function handleFormSubmit(
  event
) {

  event.preventDefault();


  clearFormError();

  clearFieldErrors();


  const values =
    getFormValues();


  if (!validateRateForm(values)) {
    return;
  }


  try {

    setSaving(true);


    await saveNewRate(
      values
    );


    showFormError(
      "",
      false
    );


    showToast(
      "নতুন Meal Rate সফলভাবে সংরক্ষণ হয়েছে।",
      "success"
    );


    dom.form?.reset();


    setTodayAsDefault();


    await loadRates();


    renderSettings();

  } catch (error) {

    console.error(
      "[Mealmate] Rate save error:",
      error
    );


    showFormError(
      getFriendlyError(error)
    );

  } finally {

    setSaving(false);
  }
}


/* =========================================================
   GET FORM VALUES
   ========================================================= */

function getFormValues() {

  return {

    effectiveDate:
      dom.effectiveDate?.value ??
      "",

    day:
      toMoney(
        dom.day?.value
      ),

    night:
      toMoney(
        dom.night?.value
      ),

    full:
      toMoney(
        dom.full?.value
      ),

    guest:
      toMoney(
        dom.guest?.value
      ),

    feast:
      toMoney(
        dom.feast?.value
      ),
  };
}


/* =========================================================
   VALIDATION
   ========================================================= */

function validateRateForm(
  values
) {

  let valid = true;


  /*
   * Effective date
   */

  if (
    !values.effectiveDate
  ) {

    setFieldError(
      "effective-date",
      "Effective Date নির্বাচন করুন।"
    );

    valid = false;
  }


  /*
   * Numeric rates
   */

  const rateFields = [
    [
      "day",
      values.day,
    ],

    [
      "night",
      values.night,
    ],

    [
      "full",
      values.full,
    ],

    [
      "guest",
      values.guest,
    ],

    [
      "feast",
      values.feast,
    ],
  ];


  for (
    const [field, value]
      of rateFields
  ) {

    if (
      !Number.isFinite(value) ||
      value < 0
    ) {

      setFieldError(
        field,
        "Rate 0 বা তার বেশি হতে হবে।"
      );

      valid = false;
    }
  }


  if (!valid) {
    return false;
  }


  /*
   * Historical protection:
   *
   * Existing date can be used only when an existing
   * rate on exactly that date does not already exist.
   */

  const duplicate =
    state.rates.find(
      (rate) =>
        rate.effective_date ===
        values.effectiveDate
    );


  if (duplicate) {

    setFieldError(
      "effective-date",
      "এই তারিখের জন্য Rate ইতিমধ্যে আছে। অন্য Effective Date দিন।"
    );

    return false;
  }


  /*
   * Historical records cannot receive a new rate
   * after a later rate already exists.
   *
   * A new rate version must be future/current relative
   * to the most recent historical boundary.
   */

  const latestDate =
    state.rates[0]?.effective_date;


  if (
    latestDate &&
    values.effectiveDate <
      latestDate
  ) {

    setFieldError(
      "effective-date",
      `Effective Date অবশ্যই সর্বশেষ Rate date (${formatDate(latestDate)})-এর সমান বা পরে হতে হবে।`
    );

    return false;
  }


  /*
   * Full Meal should normally equal Day + Night.
   *
   * We DO NOT silently modify the user's value.
   * We only warn/validate because this is a business rule.
   */

  const expectedFull =
    roundMoney(
      values.day +
      values.night
    );


  if (
    values.full !==
    expectedFull
  ) {

    setFieldError(
      "full",
      `Full Meal সাধারণত Day + Night হওয়া উচিত: ৳${formatMoney(expectedFull)}`
    );

    return false;
  }


  return true;
}


/* =========================================================
   SAVE NEW RATE
   ========================================================= */

async function saveNewRate(
  values
) {

  if (!state.mess?.id) {

    throw new Error(
      "Current Mess পাওয়া যায়নি।"
    );
  }


  /*
   * IMPORTANT:
   *
   * Do not UPDATE an existing rate.
   * A new version is always INSERTED.
   */

  const {
    error,
  } = await supabase
    .from("meal_rates")
    .insert({
      mess_id:
        state.mess.id,

      effective_date:
        values.effectiveDate,

      day_rate:
        values.day,

      night_rate:
        values.night,

      full_rate:
        values.full,

      guest_rate:
        values.guest,

      friday_feast_rate:
        values.feast,
    });


  if (error) {
    throw error;
  }
}


/* =========================================================
   DEFAULT DATE
   ========================================================= */

function setTodayAsDefault() {

  if (!dom.effectiveDate) {
    return;
  }


  if (
    !dom.effectiveDate.value
  ) {

    dom.effectiveDate.value =
      getTodayDateString();
  }
}


/* =========================================================
   FIELD ERRORS
   ========================================================= */

function setFieldError(
  field,
  message
) {

  const element =
    document.querySelector(
      `[data-rate-error="${field}"]`
    );


  if (element) {

    element.textContent =
      message;
  }
}


function clearFieldErrors() {

  document
    .querySelectorAll(
      "[data-rate-error]"
    )
    .forEach(
      (element) => {

        element.textContent =
          "";
      }
    );
}


/* =========================================================
   FORM ERROR
   ========================================================= */

function showFormError(
  message,
  show = true
) {

  if (!dom.formError) {
    return;
  }


  dom.formError.textContent =
    message;


  dom.formError.hidden =
    !show || !message;
}


function clearFormError() {

  showFormError(
    "",
    false
  );
}


/* =========================================================
   SAVE BUTTON
   ========================================================= */

function setSaving(
  saving
) {

  if (!dom.save) {
    return;
  }


  dom.save.disabled =
    saving;


  dom.save.textContent =
    saving
      ? "Saving…"
      : "Save New Rate";
}


/* =========================================================
   NO MESS
   ========================================================= */

function renderNoMess() {

  if (dom.messName) {

    dom.messName.textContent =
      "কোনো Mess পাওয়া যায়নি";
  }


  if (dom.roomRange) {

    dom.roomRange.textContent =
      "—";
  }


  if (dom.borderCount) {

    dom.borderCount.textContent =
      "0";
  }


  if (dom.currentDate) {

    dom.currentDate.textContent =
      "—";
  }


  [
    dom.currentDay,
    dom.currentNight,
    dom.currentFull,
    dom.currentGuest,
    dom.currentFeast,
  ].forEach(
    (element) => {

      setMoney(
        element,
        0
      );
    }
  );
}


/* =========================================================
   MONEY
   ========================================================= */

function setMoney(
  element,
  value
) {

  if (!element) {
    return;
  }


  element.textContent =
    `৳${formatMoney(value)}`;
}


function formatMoneyCell(
  value
) {

  return `৳${formatMoney(value)}`;
}


function formatMoney(
  value
) {

  return Number(
    value ?? 0
  ).toLocaleString(
    "en-BD",
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }
  );
}


function roundMoney(
  value
) {

  return Math.round(
    (
      Number(value) +
      Number.EPSILON
    ) * 100
  ) / 100;
}


function toMoney(
  value
) {

  const number =
    Number(value);


  if (
    !Number.isFinite(
      number
    )
  ) {

    return 0;
  }


  return roundMoney(
    number
  );
}


/* =========================================================
   DATE
   ========================================================= */

function getTodayDateString() {

  const now =
    new Date();


  const year =
    now.getFullYear();


  const month =
    String(
      now.getMonth() + 1
    ).padStart(
      2,
      "0"
    );


  const day =
    String(
      now.getDate()
    ).padStart(
      2,
      "0"
    );


  return (
    `${year}-${month}-${day}`
  );
}


function formatDate(
  value
) {

  if (!value) {
    return "—";
  }


  const date =
    new Date(
      `${value}T00:00:00`
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return value;
  }


  return new Intl.DateTimeFormat(
    "bn-BD",
    {
      year: "numeric",
      month: "short",
      day: "numeric",
    }
  ).format(date);
}


/* =========================================================
   TOAST
   ========================================================= */

function showToast(
  message,
  type = "info"
) {

  const root =
    document.querySelector(
      "#toast-root"
    );


  if (!root) {
    alert(message);
    return;
  }


  const toast =
    document.createElement(
      "div"
    );


  toast.className =
    `toast toast--${type}`;


  toast.setAttribute(
    "role",
    "status"
  );


  toast.textContent =
    message;


  root.appendChild(
    toast
  );


  window.setTimeout(
    () => {

      toast.remove();

    },
    3600
  );
}


/* =========================================================
   ERROR
   ========================================================= */

function getFriendlyError(
  error
) {

  const code =
    String(
      error?.code ?? ""
    );


  const message =
    String(
      error?.message ?? ""
    );


  if (
    code === "23505"
  ) {

    return (
      "এই Effective Date-এর Rate ইতিমধ্যে সংরক্ষণ করা আছে।"
    );
  }


  if (
    code === "42501" ||
    /row-level security|permission/i.test(
      message
    )
  ) {

    return (
      "Rate পরিবর্তন করার অনুমতি পাওয়া যায়নি।"
    );
  }


  if (
    code === "23514"
  ) {

    return (
      "Rate validation ব্যর্থ হয়েছে।"
    );
  }


  if (
    /network|fetch|offline/i.test(
      message
    )
  ) {

    return (
      "Internet connection পরীক্ষা করুন।"
    );
  }


  return (
    message ||
    "Rate সংরক্ষণ করা যায়নি।"
  );
}


/* =========================================================
   HTML SAFETY
   ========================================================= */

function escapeHtml(
  value
) {

  return String(
    value ?? ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}


/* =========================================================
   LOGIN
   ========================================================= */

function redirectToLogin() {

  const target =
    new URL(
      "./login.html",
      window.location.href
    );


  window.location.assign(
    target.href
  );
}
