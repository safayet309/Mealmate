/* =========================================================
   Mealmate — Dashboard
   File: js/dashboard.js

   Responsibilities:
   - Resolve current Mess
   - Load active members
   - Load today's meals
   - Load today's guest meals
   - Load money transactions
   - Calculate dashboard statistics
   - Render live dashboard data

   Current database contract:
   daily_meals
   - meal_type
   - expense

   guest_meals
   - quantity
   - rate
   - expense

   money_transactions
   - transaction_type
   - amount
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

  warning:
    "[data-dashboard-warning-section]",

  empty:
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

    console.error(
      "[Mealmate] Dashboard load error:",
      error
    );
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
   LOAD DASHBOARD DATA
   ========================================================= */

async function loadDashboardData() {

  const userId =
    state.user?.id;


  if (!userId) {
    return;
  }


  /*
   * -------------------------------------------------------
   * 1. LOAD ALL MESSES OWNED BY USER
   * -------------------------------------------------------
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
    .eq("created_by", userId)
    .order("created_at", {
      ascending: false,
    });


  if (messError) {
    throw messError;
  }


  if (!Array.isArray(messes) || !messes.length) {

    state.mess = null;
    state.members = [];
    state.meals = [];
    state.guests = [];
    state.transactions = [];

    return;
  }


  /*
   * -------------------------------------------------------
   * 2. RESOLVE CURRENT MESS
   * -------------------------------------------------------
   *
   * Because the current test database contains multiple
   * Mess rows for the same user, prefer the Mess that
   * actually contains active members.
   *
   * This prevents old empty test Mess rows from winning.
   * -------------------------------------------------------
   */

  const messIds =
    messes.map(
      (mess) => mess.id
    );


  const {
    data: activeMembers,
    error: activeMembersError,
  } = await supabase
    .from("members")
    .select(`
      id,
      mess_id
    `)
    .in("mess_id", messIds)
    .eq("active", true);


  if (activeMembersError) {
    throw activeMembersError;
  }


  const memberCountByMess =
    new Map();


  for (
    const member of
      activeMembers ?? []
  ) {

    const currentCount =
      memberCountByMess.get(
        member.mess_id
      ) ?? 0;


    memberCountByMess.set(
      member.mess_id,
      currentCount + 1
    );
  }


  const sortedMesses =
    [...messes].sort(
      (a, b) => {

        const memberCountA =
          memberCountByMess.get(
            a.id
          ) ?? 0;

        const memberCountB =
          memberCountByMess.get(
            b.id
          ) ?? 0;


        /*
         * Prefer Mess with actual active members.
         */

        if (
          memberCountA !==
          memberCountB
        ) {
          return (
            memberCountB -
            memberCountA
          );
        }


        /*
         * If member count ties,
         * newest Mess wins.
         */

        return (
          new Date(b.created_at) -
          new Date(a.created_at)
        );
      }
    );


  state.mess =
    sortedMesses[0] ?? null;


  if (!state.mess) {
    return;
  }


  const messId =
    state.mess.id;


  const today =
    getTodayDateString();


  /*
   * -------------------------------------------------------
   * 3. LOAD SOURCE DATA FOR CURRENT MESS
   * -------------------------------------------------------
   */

  const [
    membersResult,
    mealsResult,
    guestsResult,
    transactionsResult,
  ] = await Promise.all([

    /*
     * Active members
     */
    supabase
      .from("members")
      .select("id")
      .eq("mess_id", messId)
      .eq("active", true),


    /*
     * Today's member meals
     *
     * Current DB uses:
     * - meal_type
     * - expense
     */
    supabase
      .from("daily_meals")
      .select(`
        meal_type,
        expense
      `)
      .eq("mess_id", messId)
      .eq("meal_date", today),


    /*
     * Today's guest meals
     *
     * Current DB uses:
     * - quantity
     * - rate
     * - expense
     */
    supabase
      .from("guest_meals")
      .select(`
        quantity,
        rate,
        expense
      `)
      .eq("mess_id", messId)
      .eq("meal_date", today),


    /*
     * All money transactions
     */
    supabase
      .from("money_transactions")
      .select(`
        transaction_type,
        amount
      `)
      .eq("mess_id", messId),
  ]);


  const sourceError =
    membersResult.error ??
    mealsResult.error ??
    guestsResult.error ??
    transactionsResult.error;


  if (sourceError) {
    throw sourceError;
  }


  state.members =
    membersResult.data ?? [];

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
    state.mess.name
  );


  /*
   * Members
   */

  setText(
    SELECTORS.memberCount,
    `Member: ${state.members.length}`
  );


  /*
   * Meals
   */

  const mealSummary =
    calculateMealSummary(
      state.meals
    );


  setText(
    SELECTORS.fullCount,
    mealSummary.full
  );


  setText(
    SELECTORS.dayCount,
    mealSummary.day
  );


  setText(
    SELECTORS.nightCount,
    mealSummary.night
  );


  setText(
    SELECTORS.marketDay,
    mealSummary.marketDay
  );


  setText(
    SELECTORS.marketNight,
    mealSummary.marketNight
  );


  /*
   * Guests
   */

  const guestSummary =
    calculateGuestSummary(
      state.guests
    );


  setText(
    SELECTORS.guestCount,
    guestSummary.quantity
  );


  /*
   * Money
   */

  const moneySummary =
    calculateMoneySummary(
      state.transactions
    );


  const totalExpense =
    mealSummary.expense +
    guestSummary.expense;


  const currentBalance =
    moneySummary.deposit -
    moneySummary.refund +
    moneySummary.adjustment -
    moneySummary.other -
    totalExpense;


  setMoney(
    SELECTORS.totalDeposit,
    moneySummary.deposit
  );


  /*
   * Meal Expense card shows member meal expense.
   */
  setMoney(
    SELECTORS.mealExpense,
    mealSummary.expense
  );


  setMoney(
    SELECTORS.currentBalance,
    currentBalance
  );


  renderBalanceStatus(
    currentBalance
  );
}


/* =========================================================
   MEAL SUMMARY
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


  for (
    const meal of
      meals ?? []
  ) {

    const type =
      String(
        meal?.meal_type ?? ""
      ).toLowerCase();


    const expense =
      Number(
        meal?.expense ?? 0
      );


    summary.expense +=
      expense;


    switch (type) {

      case "full":

        summary.full += 1;

        /*
         * FULL counts once in both
         * Day and Night market.
         */

        summary.marketDay += 1;
        summary.marketNight += 1;

        break;


      case "day":

        summary.day += 1;

        summary.marketDay += 1;

        break;


      case "night":

        summary.night += 1;

        summary.marketNight += 1;

        break;


      case "none":

      default:

        break;
    }
  }


  return summary;
}


/* =========================================================
   GUEST SUMMARY
   ========================================================= */

function calculateGuestSummary(guests) {

  const summary = {
    quantity: 0,
    expense: 0,
  };


  for (
    const guest of
      guests ?? []
  ) {

    summary.quantity +=
      Number(
        guest?.quantity ?? 0
      );


    summary.expense +=
      Number(
        guest?.expense ?? 0
      );
  }


  return summary;
}


/* =========================================================
   MONEY SUMMARY
   ========================================================= */

function calculateMoneySummary(
  transactions
) {

  const summary = {
    deposit: 0,
    refund: 0,
    adjustment: 0,
    other: 0,
  };


  for (
    const transaction of
      transactions ?? []
  ) {

    const amount =
      Number(
        transaction?.amount ?? 0
      );


    switch (
      String(
        transaction?.transaction_type ?? ""
      ).toLowerCase()
    ) {

      case "deposit":

        summary.deposit +=
          amount;

        break;


      case "refund":

        summary.refund +=
          amount;

        break;


      case "adjustment":

        summary.adjustment +=
          amount;

        break;


      case "other":

        summary.other +=
          amount;

        break;


      default:

        break;
    }
  }


  return summary;
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
      SELECTORS.warning
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
      SELECTORS.empty
    );


  if (!element) {
    return;
  }


  element.hidden =
    !show;
}


/* =========================================================
   TEXT / MONEY
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
    ).padStart(2, "0");


  const day =
    String(
      date.getDate()
    ).padStart(2, "0");


  return `${year}-${month}-${day}`;
}
