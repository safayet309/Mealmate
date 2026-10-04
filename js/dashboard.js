/* =========================================================
   Mealmate — Dashboard
   File: js/dashboard.js

   Dashboard is intentionally defensive because the current
   database contains data from earlier schema iterations.

   It reads source rows with select("*") and normalizes the
   possible field names without changing the database.
   ========================================================= */

import {
  supabase,
  getCurrentUser,
} from "./supabase.js";


/* =========================================================
   SELECTORS
   ========================================================= */

const SELECTORS = {
  messName:
    '[data-dashboard="mess-name"]',

  memberCount:
    '[data-dashboard="member-count"]',

  totalDeposit:
    '[data-dashboard="total-deposit"]',

  mealExpense:
    '[data-dashboard="meal-expense"]',

  currentBalance:
    '[data-dashboard="current-balance"]',

  balanceStatus:
    '[data-dashboard="balance-status"]',

  fullCount:
    '[data-dashboard="full-count"]',

  dayCount:
    '[data-dashboard="day-count"]',

  nightCount:
    '[data-dashboard="night-count"]',

  guestCount:
    '[data-dashboard="guest-count"]',

  marketDay:
    '[data-dashboard="market-day"]',

  marketNight:
    '[data-dashboard="market-night"]',

  warningSection:
    "[data-dashboard-warning-section]",

  emptySection:
    "[data-dashboard-empty]",
};


/* =========================================================
   STATE
   ========================================================= */

const state = {
  user: null,
  mess: null,

  members: [],
  meals: [],
  guests: [],
  transactions: [],
};


/* =========================================================
   START
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {
    initializeDashboard();
  }
);


/* =========================================================
   INITIALIZE
   ========================================================= */

async function initializeDashboard() {

  if (!isDashboardPage()) {
    return;
  }

  try {

    const user =
      await getCurrentUser();

    if (!user) {
      return;
    }

    state.user = user;

    await loadDashboardData();

    renderDashboard();

  } catch (error) {

    /*
     * Do not silently keep placeholder data.
     * Keep the technical error available in console.
     */
    console.error(
      "[Mealmate] Dashboard error:",
      error
    );

    showDashboardError(error);
  }
}


/* =========================================================
   PAGE CHECK
   ========================================================= */

function isDashboardPage() {

  const path =
    window.location.pathname
      .replace(/\\/g, "/");

  return (
    path.endsWith("/") ||
    path.endsWith("/index.html")
  );
}


/* =========================================================
   LOAD DASHBOARD
   ========================================================= */

async function loadDashboardData() {

  const userId =
    state.user?.id;

  if (!userId) {
    return;
  }


  /*
   * -------------------------------------------------------
   * Find all Mess records belonging to current user.
   * -------------------------------------------------------
   */

  const {
    data: messes,
    error: messError,
  } = await supabase
    .from("mess")
    .select("*")
    .eq("created_by", userId)
    .order("created_at", {
      ascending: false,
    });


  if (messError) {
    throw messError;
  }


  if (
    !Array.isArray(messes) ||
    messes.length === 0
  ) {

    state.mess = null;

    state.members = [];
    state.meals = [];
    state.guests = [];
    state.transactions = [];

    return;
  }


  /*
   * -------------------------------------------------------
   * Find active members for all candidate Mess records.
   * -------------------------------------------------------
   */

  const messIds =
    messes
      .map(
        (mess) => mess.id
      )
      .filter(Boolean);


  const {
    data: allMembers,
    error: membersError,
  } = await supabase
    .from("members")
    .select("*")
    .in("mess_id", messIds)
    .eq("active", true);


  if (membersError) {
    throw membersError;
  }


  /*
   * -------------------------------------------------------
   * Prefer a Mess that actually contains active members.
   * If there are several, newest wins.
   * -------------------------------------------------------
   */

  const memberCountByMess =
    new Map();


  for (
    const member of
      allMembers ?? []
  ) {

    const messId =
      member?.mess_id;

    if (!messId) {
      continue;
    }

    memberCountByMess.set(
      messId,
      (
        memberCountByMess.get(
          messId
        ) ?? 0
      ) + 1
    );
  }


  const candidates =
    [...messes].sort(
      (a, b) => {

        const countA =
          memberCountByMess.get(
            a.id
          ) ?? 0;

        const countB =
          memberCountByMess.get(
            b.id
          ) ?? 0;


        if (
          countA !== countB
        ) {
          return countB - countA;
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
    candidates[0] ?? null;


  if (!state.mess) {
    return;
  }


  const messId =
    state.mess.id;


  /*
   * -------------------------------------------------------
   * Current Mess members
   * -------------------------------------------------------
   */

  state.members =
    (
      allMembers ?? []
    ).filter(
      (member) =>
        member.mess_id === messId
    );


  /*
   * -------------------------------------------------------
   * Today
   * -------------------------------------------------------
   */

  const today =
    getTodayDateString();


  /*
   * IMPORTANT:
   *
   * We intentionally use select("*").
   * This avoids breaking the Dashboard because an older
   * database migration may use a different column name.
   * -------------------------------------------------------
   */

  const [
    mealsResult,
    guestsResult,
    transactionsResult,
  ] = await Promise.all([

    supabase
      .from("daily_meals")
      .select("*")
      .eq("mess_id", messId)
      .eq("meal_date", today),

    supabase
      .from("guest_meals")
      .select("*")
      .eq("mess_id", messId)
      .eq("meal_date", today),

    supabase
      .from("money_transactions")
      .select("*")
      .eq("mess_id", messId),
  ]);


  if (mealsResult.error) {
    throw mealsResult.error;
  }


  if (guestsResult.error) {
    throw guestsResult.error;
  }


  if (transactionsResult.error) {
    throw transactionsResult.error;
  }


  state.meals =
    mealsResult.data ?? [];

  state.guests =
    guestsResult.data ?? [];

  state.transactions =
    transactionsResult.data ?? [];
}


/* =========================================================
   RENDER
   ========================================================= */

function renderDashboard() {

  if (!state.mess) {

    showEmptyState(true);

    return;
  }


  showEmptyState(false);


  /*
   * Mess
   */

  setText(
    SELECTORS.messName,
    state.mess.name ?? "—"
  );


  /*
   * Active members
   */

  setText(
    SELECTORS.memberCount,
    `Member: ${state.members.length}`
  );


  /*
   * Meal summary
   */

  const meal =
    calculateMealSummary(
      state.meals
    );


  setText(
    SELECTORS.fullCount,
    meal.full
  );


  setText(
    SELECTORS.dayCount,
    meal.day
  );


  setText(
    SELECTORS.nightCount,
    meal.night
  );


  setText(
    SELECTORS.marketDay,
    meal.marketDay
  );


  setText(
    SELECTORS.marketNight,
    meal.marketNight
  );


  /*
   * Guest summary
   */

  const guest =
    calculateGuestSummary(
      state.guests
    );


  setText(
    SELECTORS.guestCount,
    guest.quantity
  );


  /*
   * Money
   */

  const money =
    calculateMoneySummary(
      state.transactions
    );


  /*
   * Meal Expense card:
   * member meal expense only.
   */

  const mealExpense =
    meal.expense;


  setMoney(
    SELECTORS.totalDeposit,
    money.deposit
  );


  setMoney(
    SELECTORS.mealExpense,
    mealExpense
  );


  /*
   * Current balance:
   *
   * deposit
   * - refund
   * + adjustment
   * - other
   * - member meal expense
   * - guest expense
   */

  const currentBalance =
    money.deposit
    - money.refund
    + money.adjustment
    - money.other
    - meal.expense
    - guest.expense;


  setMoney(
    SELECTORS.currentBalance,
    currentBalance
  );


  renderBalanceStatus(
    currentBalance
  );
}


/* =========================================================
   MEAL NORMALIZATION
   ========================================================= */

function calculateMealSummary(
  meals
) {

  const result = {

    full: 0,
    day: 0,
    night: 0,

    marketDay: 0,
    marketNight: 0,

    expense: 0,
  };


  for (
    const row of
      meals ?? []
  ) {

    const type =
      String(
        row?.meal_type ??
        row?.type ??
        ""
      ).toLowerCase();


    /*
     * Support both possible expense names.
     */

    const expense =
      toNumber(
        row?.expense ??
        row?.meal_expense ??
        0
      );


    result.expense +=
      expense;


    switch (type) {

      case "full":

        result.full += 1;

        result.marketDay += 1;
        result.marketNight += 1;

        break;


      case "day":

        result.day += 1;

        result.marketDay += 1;

        break;


      case "night":

        result.night += 1;

        result.marketNight += 1;

        break;


      case "none":
      case "no_meal":
      case "no meal":

        break;


      default:

        break;
    }


    /*
     * If explicit market-count fields exist,
     * use them because they are authoritative.
     */

    if (
      row?.market_day_count !==
      undefined
    ) {

      result.marketDay -=
        getCalculatedMarketDay(
          type
        );

      result.marketDay +=
        toNumber(
          row.market_day_count
        );
    }


    if (
      row?.market_night_count !==
      undefined
    ) {

      result.marketNight -=
        getCalculatedMarketNight(
          type
        );

      result.marketNight +=
        toNumber(
          row.market_night_count
        );
    }
  }


  return result;
}


function getCalculatedMarketDay(
  type
) {

  return (
    type === "full" ||
    type === "day"
  )
    ? 1
    : 0;
}


function getCalculatedMarketNight(
  type
) {

  return (
    type === "full" ||
    type === "night"
  )
    ? 1
    : 0;
}


/* =========================================================
   GUEST NORMALIZATION
   ========================================================= */

function calculateGuestSummary(
  guests
) {

  const result = {
    quantity: 0,
    expense: 0,
  };


  for (
    const row of
      guests ?? []
  ) {

    const quantity =
      toNumber(
        row?.quantity ??
        row?.guest_count ??
        row?.count ??
        0
      );


    const expense =
      toNumber(
        row?.expense ??
        row?.total_expense ??
        row?.total_amount ??
        0
      );


    result.quantity +=
      quantity;

    result.expense +=
      expense;
  }


  return result;
}


/* =========================================================
   MONEY NORMALIZATION
   ========================================================= */

function calculateMoneySummary(
  transactions
) {

  const result = {

    deposit: 0,
    refund: 0,
    adjustment: 0,
    other: 0,
  };


  for (
    const row of
      transactions ?? []
  ) {

    const type =
      String(
        row?.transaction_type ??
        row?.type ??
        ""
      ).toLowerCase();


    const amount =
      toNumber(
        row?.amount
      );


    switch (type) {

      case "deposit":

        result.deposit +=
          amount;

        break;


      case "refund":

        result.refund +=
          amount;

        break;


      case "adjustment":

        result.adjustment +=
          amount;

        break;


      case "other":

        result.other +=
          amount;

        break;


      default:

        break;
    }
  }


  return result;
}


/* =========================================================
   BALANCE STATUS
   ========================================================= */

function renderBalanceStatus(
  balance
) {

  const element =
    document.querySelector(
      SELECTORS.balanceStatus
    );


  if (!element) {
    return;
  }


  if (balance <= -500) {

    element.textContent =
      "Warning";

    element.dataset.status =
      "danger";

  } else if (balance < 0) {

    element.textContent =
      "Negative balance";

    element.dataset.status =
      "warning";

  } else {

    element.textContent =
      "No warning";

    element.dataset.status =
      "success";
  }


  const warning =
    document.querySelector(
      SELECTORS.warningSection
    );


  if (warning) {

    warning.hidden =
      balance > -500;
  }
}


/* =========================================================
   EMPTY STATE
   ========================================================= */

function showEmptyState(
  show
) {

  const element =
    document.querySelector(
      SELECTORS.emptySection
    );


  if (!element) {
    return;
  }


  element.hidden =
    !show;
}


/* =========================================================
   ERROR STATE
   ========================================================= */

function showDashboardError(
  error
) {

  const messElement =
    document.querySelector(
      SELECTORS.messName
    );


  /*
   * Keep dashboard usable while making the
   * problem visible during development.
   */

  if (messElement) {

    messElement.textContent =
      "Data Load Error";

    messElement.title =
      String(
        error?.message ??
        error ??
        "Unknown error"
      );
  }


  console.error(
    "[Mealmate] Dashboard diagnostic:",
    {
      message:
        error?.message,
      code:
        error?.code,
      details:
        error?.details,
      hint:
        error?.hint,
    }
  );
}


/* =========================================================
   HELPERS
   ========================================================= */

function setText(
  selector,
  value
) {

  const element =
    document.querySelector(
      selector
    );


  if (!element) {
    return;
  }


  element.textContent =
    String(value);
}


function setMoney(
  selector,
  value
) {

  setText(
    selector,
    `৳${formatMoney(value)}`
  );
}


function formatMoney(
  value
) {

  return Number(
    value || 0
  ).toLocaleString(
    "en-BD",
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }
  );
}


function toNumber(
  value
) {

  const number =
    Number(value);


  return Number.isFinite(
    number
  )
    ? number
    : 0;
}


/* =========================================================
   DATE
   ========================================================= */

function getTodayDateString() {

  const date =
    new Date();


  const year =
    date.getFullYear();


  const month =
    String(
      date.getMonth() + 1
    ).padStart(
      2,
      "0"
    );


  const day =
    String(
      date.getDate()
    ).padStart(
      2,
      "0"
    );


  return (
    `${year}-${month}-${day}`
  );
}
