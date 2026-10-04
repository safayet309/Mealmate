/* =========================================================
   Mealmate — Dashboard
   File: js/dashboard.js

   Responsibilities:
   - Load current Mess
   - Load active member count
   - Load today's meal summary
   - Load today's guest summary
   - Load money summary
   - Calculate current balance
   - Update dashboard UI

   Depends on:
   - js/supabase.js
   ========================================================= */

import {
  supabase,
  getCurrentUser,
} from "./supabase.js";


/* =========================================================
   CONSTANTS
   ========================================================= */

const DASHBOARD_SELECTORS = {
  messName: '[data-dashboard="mess-name"]',
  memberCount: '[data-dashboard="member-count"]',

  totalDeposit: '[data-dashboard="total-deposit"]',
  mealExpense: '[data-dashboard="meal-expense"]',
  currentBalance: '[data-dashboard="current-balance"]',
  balanceStatus: '[data-dashboard="balance-status"]',

  fullCount: '[data-dashboard="full-count"]',
  dayCount: '[data-dashboard="day-count"]',
  nightCount: '[data-dashboard="night-count"]',
  guestCount: '[data-dashboard="guest-count"]',

  marketDay: '[data-dashboard="market-day"]',
  marketNight: '[data-dashboard="market-night"]',

  warningSection: "[data-dashboard-warning-section]",
  emptySection: "[data-dashboard-empty]",
};


/* =========================================================
   STATE
   ========================================================= */

const dashboardState = {
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
  /*
   * Dashboard code should only run on the root dashboard.
   */
  if (!isDashboardPage()) {
    return;
  }

  try {
    const user = await getCurrentUser();

    if (!user) {
      return;
    }

    dashboardState.user = user;

    setDashboardLoading(true);

    await loadDashboardData();

    renderDashboard();

  } catch (error) {

    console.error(
      "[Mealmate] Dashboard load error:",
      error
    );

  } finally {

    setDashboardLoading(false);
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
   LOAD DATA
   ========================================================= */

async function loadDashboardData() {

  const userId =
    dashboardState.user?.id;

  if (!userId) {
    return;
  }


  /*
   * Current Mess
   */
  const {
    data: mess,
    error: messError,
  } = await supabase
    .from("mess")
    .select(`
      id,
      name,
      room_start,
      room_end,
      border_count
    `)
    .eq("created_by", userId)
    .limit(1)
    .maybeSingle();


  if (messError) {
    throw messError;
  }


  /*
   * No Mess means setup is incomplete.
   */
  if (!mess) {
    dashboardState.mess = null;
    dashboardState.members = [];
    dashboardState.meals = [];
    dashboardState.guests = [];
    dashboardState.transactions = [];
    return;
  }


  dashboardState.mess = mess;


  const messId = mess.id;

  const today =
    getTodayDateString();


  /*
   * Load all dashboard source data.
   */
  const [
    membersResult,
    mealsResult,
    guestsResult,
    transactionsResult,
  ] = await Promise.all([

    supabase
      .from("members")
      .select("id")
      .eq("mess_id", messId)
      .eq("active", true),

    supabase
      .from("daily_meals")
      .select(`
        meal_type,
        day_rate_applied,
        night_rate_applied,
        full_rate_applied,
        meal_expense,
        market_day_count,
        market_night_count
      `)
      .eq("mess_id", messId)
      .eq("meal_date", today),

    supabase
      .from("guest_meals")
      .select(`
        guest_count,
        guest_rate_applied,
        total_expense
      `)
      .eq("mess_id", messId)
      .eq("meal_date", today),

    supabase
      .from("money_transactions")
      .select(`
        transaction_type,
        amount
      `)
      .eq("mess_id", messId),
  ]);


  const resultError =
    membersResult.error ||
    mealsResult.error ||
    guestsResult.error ||
    transactionsResult.error;

  if (resultError) {
    throw resultError;
  }


  dashboardState.members =
    membersResult.data ?? [];

  dashboardState.meals =
    mealsResult.data ?? [];

  dashboardState.guests =
    guestsResult.data ?? [];

  dashboardState.transactions =
    transactionsResult.data ?? [];
}


/* =========================================================
   RENDER
   ========================================================= */

function renderDashboard() {

  const mess =
    dashboardState.mess;

  /*
   * Empty state
   */
  if (!mess) {
    showEmptyState(true);
    return;
  }

  showEmptyState(false);


  /*
   * Mess
   */
  setText(
    DASHBOARD_SELECTORS.messName,
    mess.name
  );


  /*
   * Member count
   */
  setText(
    DASHBOARD_SELECTORS.memberCount,
    `Member: ${dashboardState.members.length}`
  );


  /*
   * Meal summary
   */
  const mealSummary =
    calculateMealSummary(
      dashboardState.meals
    );


  setText(
    DASHBOARD_SELECTORS.fullCount,
    mealSummary.full
  );

  setText(
    DASHBOARD_SELECTORS.dayCount,
    mealSummary.day
  );

  setText(
    DASHBOARD_SELECTORS.nightCount,
    mealSummary.night
  );

  setText(
    DASHBOARD_SELECTORS.marketDay,
    mealSummary.marketDay
  );

  setText(
    DASHBOARD_SELECTORS.marketNight,
    mealSummary.marketNight
  );


  /*
   * Guest summary
   */
  const guestCount =
    dashboardState.guests.reduce(
      (total, item) =>
        total +
        Number(item.guest_count || 0),
      0
    );


  setText(
    DASHBOARD_SELECTORS.guestCount,
    guestCount
  );


  /*
   * Money summary
   */
  const money =
    calculateMoneySummary(
      dashboardState.transactions
    );


  const currentBalance =
    money.deposit -
    money.refund +
    money.adjustment -
    money.other -
    mealSummary.expense -
    calculateGuestExpense();


  setMoney(
    DASHBOARD_SELECTORS.totalDeposit,
    money.deposit
  );

  setMoney(
    DASHBOARD_SELECTORS.mealExpense,
    mealSummary.expense
  );

  setMoney(
    DASHBOARD_SELECTORS.currentBalance,
    currentBalance
  );


  renderBalanceStatus(
    currentBalance
  );
}


/* =========================================================
   MEAL CALCULATION
   ========================================================= */

function calculateMealSummary(meals) {

  const summary = {
    full: 0,
    day: 0,
    night: 0,

    marketDay: 0,
    marketNight: 0,

    expense: 0,
  };


  meals.forEach((meal) => {

    switch (meal.meal_type) {

      case "full":
        summary.full += 1;
        break;

      case "day":
        summary.day += 1;
        break;

      case "night":
        summary.night += 1;
        break;

      default:
        break;
    }


    summary.marketDay +=
      Number(
        meal.market_day_count || 0
      );

    summary.marketNight +=
      Number(
        meal.market_night_count || 0
      );

    summary.expense +=
      Number(
        meal.meal_expense || 0
      );
  });


  return summary;
}


/* =========================================================
   MONEY CALCULATION
   ========================================================= */

function calculateMoneySummary(transactions) {

  const result = {
    deposit: 0,
    refund: 0,
    adjustment: 0,
    other: 0,
  };


  transactions.forEach(
    (transaction) => {

      const amount =
        Number(
          transaction.amount || 0
        );

      switch (
        transaction.transaction_type
      ) {

        case "deposit":
          result.deposit += amount;
          break;

        case "refund":
          result.refund += amount;
          break;

        case "adjustment":
          result.adjustment += amount;
          break;

        case "other":
          result.other += amount;
          break;

        default:
          break;
      }
    }
  );


  return result;
}


/* =========================================================
   GUEST EXPENSE
   ========================================================= */

function calculateGuestExpense() {

  return dashboardState.guests.reduce(
    (total, guest) =>
      total +
      Number(
        guest.total_expense || 0
      ),
    0
  );
}


/* =========================================================
   BALANCE STATUS
   ========================================================= */

function renderBalanceStatus(balance) {

  const element =
    document.querySelector(
      DASHBOARD_SELECTORS.balanceStatus
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


  const warningSection =
    document.querySelector(
      DASHBOARD_SELECTORS.warningSection
    );

  if (warningSection) {

    warningSection.hidden =
      balance > -500;
  }
}


/* =========================================================
   UI HELPERS
   ========================================================= */

function setText(selector, value) {

  const element =
    document.querySelector(selector);

  if (!element) {
    return;
  }

  element.textContent =
    String(value);
}


function setMoney(selector, value) {

  setText(
    selector,
    `৳${formatMoney(value)}`
  );
}


function formatMoney(value) {

  return Number(value || 0)
    .toLocaleString(
      "en-BD",
      {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }
    );
}


function setDashboardLoading(isLoading) {

  const dashboard =
    document.querySelector(
      ".main-content"
    );

  if (!dashboard) {
    return;
  }

  dashboard.dataset.loading =
    String(isLoading);
}


function showEmptyState(show) {

  const element =
    document.querySelector(
      DASHBOARD_SELECTORS.emptySection
    );

  if (!element) {
    return;
  }

  element.hidden = !show;
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
    ).padStart(2, "0");

  const day =
    String(
      now.getDate()
    ).padStart(2, "0");


  return `${year}-${month}-${day}`;
}
