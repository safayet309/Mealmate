/* =========================================================
   Mealmate — Mess Setup Controller
   File: js/setup.js

   Responsibilities:
   - Setup wizard step navigation
   - Mess information validation
   - Room preview
   - Member row generation
   - Member search
   - Initial meal-rate validation
   - Secure Mess creation through Supabase RPC
   - Initial member creation
   - Redirect to dashboard after successful setup
   ========================================================= */

import {
  APP_CONFIG,
  ROUTES,
} from "./config.js";

import {
  supabase,
  getCurrentUser,
  normalizeSupabaseError,
} from "./supabase.js";


/* =========================================================
   1. STATE
   ========================================================= */

const state = {
  currentStep: 1,
  rooms: [],
  members: [],
  createdMess: null,
  submitting: false,
};


/* =========================================================
   2. DOM HELPERS
   ========================================================= */

const $ = (selector, root = document) =>
  root.querySelector(selector);

const $$ = (selector, root = document) =>
  [...root.querySelectorAll(selector)];


/* =========================================================
   3. DOM REFERENCES
   ========================================================= */

const form = $("#mess-setup-form");

const setupError = $("#setup-error");
const setupSubmit = $("#setup-submit");

const messNameInput = $("#mess-name");
const roomStartInput = $("#room-start");
const roomEndInput = $("#room-end");
const borderCountInput = $("#border-count");

const roomPreview = $("#room-preview");
const roomPreviewList = $("#room-preview-list");
const roomPreviewCount = $("#room-preview-count");

const memberSearch = $("#member-search");
const memberList = $("#setup-members-list");
const memberEmpty = $("#setup-members-empty");
const memberCountBadge = $("#member-count-badge");

const memberTemplate = $("#setup-member-template");

const dayRateInput = $("#day-rate");
const nightRateInput = $("#night-rate");
const fullRateInput = $("#full-rate");
const guestRateInput = $("#guest-rate");
const fridayFeastRateInput = $("#friday-feast-rate");


/* =========================================================
   4. INITIALIZATION
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  initializeSetup
);


function initializeSetup() {
  if (!form) {
    return;
  }

  bindStepNavigation();
  bindFormInputs();
  bindMemberControls();
  bindSubmit();

  setActiveStep(1);
  updateRoomPreview();
}


/* =========================================================
   5. STEP NAVIGATION
   ========================================================= */

function bindStepNavigation() {
  $$("[data-next-step]").forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        const step = Number(button.dataset.nextStep);

        goToStep(step);
      }
    );
  });


  $$("[data-prev-step]").forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        const step = Number(button.dataset.prevStep);

        goToStep(step);
      }
    );
  });


  $$("[data-step-trigger]").forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        const step = Number(button.dataset.stepTrigger);

        /*
         * Users can always move backwards.
         * Moving forward is validated first.
         */
        if (step < state.currentStep) {
          goToStep(step);
          return;
        }

        if (step === state.currentStep) {
          return;
        }

        if (!validateStep(state.currentStep)) {
          return;
        }

        if (state.currentStep === 2) {
          collectMembersFromDOM();
        }

        goToStep(step);
      }
    );
  });
}


function goToStep(step) {
  if (![1, 2, 3].includes(step)) {
    return;
  }

  if (step > state.currentStep) {
    if (!validateStep(state.currentStep)) {
      return;
    }
  }

  if (
    state.currentStep === 2 &&
    step > state.currentStep
  ) {
    collectMembersFromDOM();
  }

  setActiveStep(step);
}


function setActiveStep(step) {
  state.currentStep = step;

  $$(".setup-step").forEach((section) => {
    const active =
      Number(section.dataset.step) === step;

    section.classList.toggle(
      "is-active",
      active
    );

    section.hidden = !active;
  });


  $$("[data-step-trigger]").forEach((button) => {
    const buttonStep =
      Number(button.dataset.stepTrigger);

    const active =
      buttonStep === step;

    const completed =
      buttonStep < step;

    button.classList.toggle(
      "is-active",
      active
    );

    button.classList.toggle(
      "is-complete",
      completed
    );

    if (active) {
      button.setAttribute(
        "aria-current",
        "step"
      );
    } else {
      button.removeAttribute(
        "aria-current"
      );
    }
  });


  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
}


/* =========================================================
   6. INPUT BINDINGS
   ========================================================= */

function bindFormInputs() {
  [
    messNameInput,
    roomStartInput,
    roomEndInput,
    borderCountInput,
  ].forEach((input) => {
    if (!input) {
      return;
    }

    input.addEventListener(
      "input",
      clearGlobalError
    );
  });


  [
    roomStartInput,
    roomEndInput,
  ].forEach((input) => {
    if (!input) {
      return;
    }

    input.addEventListener(
      "input",
      updateRoomPreview
    );
  });


  [
    dayRateInput,
    nightRateInput,
    fullRateInput,
    guestRateInput,
    fridayFeastRateInput,
  ].forEach((input) => {
    if (!input) {
      return;
    }

    input.addEventListener(
      "input",
      clearGlobalError
    );
  });
}


/* =========================================================
   7. ROOM PREVIEW
   ========================================================= */

function updateRoomPreview() {
  if (
    !roomPreview ||
    !roomPreviewList
  ) {
    return;
  }

  const start =
    Number(roomStartInput?.value);

  const end =
    Number(roomEndInput?.value);

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 1 ||
    end < start ||
    end > 99999
  ) {
    roomPreview.hidden = true;
    roomPreviewList.innerHTML = "";

    if (roomPreviewCount) {
      roomPreviewCount.textContent =
        "0 rooms";
    }

    return;
  }

  const totalRooms =
    end - start + 1;

  roomPreview.hidden = false;
  roomPreviewList.innerHTML = "";

  if (roomPreviewCount) {
    roomPreviewCount.textContent =
      `${totalRooms} room${totalRooms === 1 ? "" : "s"}`;
  }


  /*
   * Render all rooms for small ranges.
   */
  if (totalRooms <= 30) {
    for (
      let room = start;
      room <= end;
      room++
    ) {
      appendRoomPreviewItem(room);
    }

    return;
  }


  /*
   * Large range:
   * render a compact preview.
   */
  const previewCount = 10;

  for (
    let room = start;
    room < start + previewCount;
    room++
  ) {
    appendRoomPreviewItem(room);
  }


  const more = document.createElement("span");

  more.className =
    "room-preview-more";

  more.textContent =
    `+ ${totalRooms - previewCount} more rooms`;

  roomPreviewList.appendChild(more);
}


function appendRoomPreviewItem(roomNumber) {
  const item =
    document.createElement("span");

  item.className =
    "room-preview-item";

  item.textContent =
    String(roomNumber);

  roomPreviewList.appendChild(item);
}


/* =========================================================
   8. MEMBER CONTROLS
   ========================================================= */

function bindMemberControls() {
  if (memberSearch) {
    memberSearch.addEventListener(
      "input",
      handleMemberSearch
    );
  }


  const activateAllButton =
    $('[data-action="activate-all-members"]');

  if (activateAllButton) {
    activateAllButton.addEventListener(
      "click",
      () => {
        $$("[data-member-active]").forEach(
          (checkbox) => {
            checkbox.checked = true;
          }
        );

        updateMemberCount();
      }
    );
  }
}


function generateMemberRows() {
  if (!memberList || !memberTemplate) {
    return;
  }

  const start =
    Number(roomStartInput?.value);

  const end =
    Number(roomEndInput?.value);

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 1 ||
    end < start
  ) {
    return;
  }


  const previousValues =
    readExistingMemberValues();

  /*
   * Remove old generated rows only.
   */
  $$("[data-member-row]", memberList)
    .forEach((row) => row.remove());


  state.rooms = [];


  for (
    let room = start;
    room <= end;
    room++
  ) {
    state.rooms.push(room);

    const fragment =
      memberTemplate.content.cloneNode(true);

    const row =
      $("[data-member-row]", fragment);

    const roomElement =
      $("[data-member-room]", fragment);

    const nameInput =
      $("[data-member-name]", fragment);

    const activeInput =
      $("[data-member-active]", fragment);


    if (row) {
      row.dataset.roomNumber =
        String(room);

      row.dataset.searchText =
        String(room)
          .toLowerCase();
    }


    if (roomElement) {
      roomElement.textContent =
        String(room);
    }


    const previous =
      previousValues.get(room);


    if (nameInput) {
      nameInput.value =
        previous?.name ?? "";

      nameInput.addEventListener(
        "input",
        () => {
          updateMemberSearchText(row);
          updateMemberCount();
        }
      );
    }


    if (activeInput) {
      activeInput.checked =
        previous
          ? previous.active
          : true;

      activeInput.addEventListener(
        "change",
        updateMemberCount
      );
    }


    memberList.appendChild(fragment);
  }

  updateMemberSearchTextForAll();
  updateMemberCount();
}


function readExistingMemberValues() {
  const values =
    new Map();

  $$("[data-member-row]", memberList)
    .forEach((row) => {
      const room =
        Number(row.dataset.roomNumber);

      const name =
        $("[data-member-name]", row)
          ?.value
          .trim() ?? "";

      const active =
        Boolean(
          $("[data-member-active]", row)
            ?.checked
        );

      if (Number.isInteger(room)) {
        values.set(
          room,
          {
            name,
            active,
          }
        );
      }
    });

  return values;
}


function collectMembersFromDOM() {
  const rows =
    $$("[data-member-row]", memberList);

  state.members =
    rows
      .map((row) => {
        const roomNumber =
          Number(
            row.dataset.roomNumber
          );

        const name =
          $("[data-member-name]", row)
            ?.value
            .trim() ?? "";

        const active =
          Boolean(
            $("[data-member-active]", row)
              ?.checked
          );

        return {
          roomNumber,
          name,
          active,
        };
      })
      .filter(
        (member) =>
          Number.isInteger(member.roomNumber)
      );
}


function updateMemberSearchText(row) {
  if (!row) {
    return;
  }

  const room =
    row.dataset.roomNumber ?? "";

  const name =
    $("[data-member-name]", row)
      ?.value
      .trim() ?? "";

  row.dataset.searchText =
    `${room} ${name}`.toLowerCase();
}


function updateMemberSearchTextForAll() {
  $$("[data-member-row]", memberList)
    .forEach(updateMemberSearchText);
}


function handleMemberSearch() {
  const query =
    memberSearch?.value
      ?.trim()
      .toLowerCase() ?? "";

  let visibleCount = 0;

  $$("[data-member-row]", memberList)
    .forEach((row) => {
      const text =
        row.dataset.searchText ?? "";

      const match =
        !query ||
        text.includes(query);

      row.hidden = !match;

      if (match) {
        visibleCount++;
      }
    });


  if (memberEmpty) {
    memberEmpty.hidden =
      visibleCount > 0;

    if (query && visibleCount === 0) {
      const title =
        $("h3", memberEmpty);

      const message =
        $("p", memberEmpty);

      if (title) {
        title.textContent =
          "কোনো Member পাওয়া যায়নি";
      }

      if (message) {
        message.textContent =
          `"${query}" এর সাথে মিল পাওয়া যায়নি।`;
      }
    }
  }
}


function updateMemberCount() {
  const rows =
    $$("[data-member-row]", memberList);

  let namedCount = 0;
  let activeCount = 0;

  rows.forEach((row) => {
    const name =
      $("[data-member-name]", row)
        ?.value
        .trim() ?? "";

    const active =
      Boolean(
        $("[data-member-active]", row)
          ?.checked
      );

    if (name) {
      namedCount++;
    }

    if (name && active) {
      activeCount++;
    }
  });


  if (memberCountBadge) {
    memberCountBadge.textContent =
      `${namedCount} member${namedCount === 1 ? "" : "s"}`;
  }


  if (memberEmpty) {
    memberEmpty.hidden =
      rows.length > 0;
  }


  return {
    namedCount,
    activeCount,
  };
}


/* =========================================================
   9. STEP VALIDATION
   ========================================================= */

function validateStep(step) {
  clearGlobalError();
  clearFieldErrors();


  if (step === 1) {
    const valid =
      validateMessInfo();

    if (valid) {
      generateMemberRows();
    }

    return valid;
  }


  if (step === 2) {
    collectMembersFromDOM();

    return validateMembers();
  }


  if (step === 3) {
    return validateRates();
  }


  return true;
}


function validateMessInfo() {
  let valid = true;

  const name =
    messNameInput?.value.trim() ?? "";

  const roomStart =
    Number(roomStartInput?.value);

  const roomEnd =
    Number(roomEndInput?.value);

  const borderCount =
    Number(borderCountInput?.value);


  if (!name) {
    setFieldError(
      "mess-name",
      "Mess name দিন।"
    );

    valid = false;
  }


  if (
    !Number.isInteger(roomStart) ||
    roomStart < 1 ||
    roomStart > 99999
  ) {
    setFieldError(
      "room-start",
      "সঠিক Room Start দিন।"
    );

    valid = false;
  }


  if (
    !Number.isInteger(roomEnd) ||
    roomEnd < roomStart ||
    roomEnd > 99999
  ) {
    setFieldError(
      "room-end",
      "Room End অবশ্যই Room Start-এর সমান বা বড় হতে হবে।"
    );

    valid = false;
  }


  if (
    Number.isInteger(roomStart) &&
    Number.isInteger(roomEnd) &&
    roomEnd >= roomStart
  ) {
    const roomCount =
      roomEnd - roomStart + 1;

    if (roomCount > 99999) {
      setFieldError(
        "room-end",
        "Room range অনেক বড় হয়েছে।"
      );

      valid = false;
    }
  }


  if (
    !Number.isInteger(borderCount) ||
    borderCount < 0 ||
    borderCount > 99999
  ) {
    setFieldError(
      "border-count",
      "Border count সঠিক সংখ্যা হতে হবে।"
    );

    valid = false;
  }


  return valid;
}


function validateMembers() {
  if (!state.members.length) {
    showGlobalError(
      "কমপক্ষে একটি Room/Member তথ্য দিন।"
    );

    return false;
  }


  const namedMembers =
    state.members.filter(
      (member) => member.name
    );


  if (!namedMembers.length) {
    showGlobalError(
      "কমপক্ষে একজন Member-এর নাম দিন।"
    );

    return false;
  }


  const activeNamedMembers =
    namedMembers.filter(
      (member) => member.active
    );


  const seenNames =
    new Set();

  for (const member of namedMembers) {
    const normalizedName =
      member.name
        .toLocaleLowerCase("bn-BD");

    if (seenNames.has(normalizedName)) {
      showGlobalError(
        `Duplicate Member name পাওয়া গেছে: ${member.name}`
      );

      return false;
    }

    seenNames.add(normalizedName);
  }


  if (activeNamedMembers.length === 0) {
    showGlobalError(
      "কমপক্ষে একজন Active Member থাকতে হবে।"
    );

    return false;
  }


  return true;
}


function validateRates() {
  const fields = [
    {
      input: dayRateInput,
      errorId: "day-rate",
      label: "Day Meal",
    },
    {
      input: nightRateInput,
      errorId: "night-rate",
      label: "Night Meal",
    },
    {
      input: fullRateInput,
      errorId: "full-rate",
      label: "Full Meal",
    },
    {
      input: guestRateInput,
      errorId: "guest-rate",
      label: "Guest Meal",
    },
    {
      input: fridayFeastRateInput,
      errorId: "friday-feast-rate",
      label: "Friday Feast",
    },
  ];

  let valid = true;


  fields.forEach((field) => {
    const value =
      Number(field.input?.value);

    if (
      !Number.isFinite(value) ||
      value < 0
    ) {
      setFieldError(
        field.errorId,
        `${field.label} rate 0 বা তার বেশি হতে হবে।`
      );

      valid = false;
    }
  });


  return valid;
}


/* =========================================================
   10. FORM SUBMIT
   ========================================================= */

function bindSubmit() {
  if (!form) {
    return;
  }

  form.addEventListener(
    "submit",
    handleSubmit
  );
}


async function handleSubmit(event) {
  event.preventDefault();

  if (state.submitting) {
    return;
  }


  clearGlobalError();
  clearFieldErrors();


  if (!validateStep(1)) {
    setActiveStep(1);
    return;
  }


  collectMembersFromDOM();


  if (!validateMembers()) {
    setActiveStep(2);
    return;
  }


  if (!validateRates()) {
    setActiveStep(3);
    return;
  }


  try {
    state.submitting = true;

    setSubmitLoading(true);

    const user =
      await getCurrentUser();

    if (!user) {
      showGlobalError(
        "Session পাওয়া যায়নি। আবার Login করুন।"
      );

      return;
    }


    const result =
      await createMess(user.id);


    state.createdMess =
      result;


    await createInitialMembers(
      result.id
    );


    await finishSetup();

  } catch (error) {
    console.error(
      "[Mealmate Setup]",
      error
    );

    showGlobalError(
      getFriendlyErrorMessage(error)
    );

  } finally {
    state.submitting = false;

    setSubmitLoading(false);
  }
}


/* =========================================================
   11. CREATE MESS
   ========================================================= */

async function createMess(userId) {
  const today = new Date();

  const effectiveDate =
    [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0"),
    ].join("-");

  const payload = {
    p_name: messNameInput.value.trim(),
    p_room_start: Number(roomStartInput.value),
    p_room_end: Number(roomEndInput.value),
    p_border_count: Number(borderCountInput.value),
    p_day_rate: toMoney(dayRateInput.value),
    p_night_rate: toMoney(nightRateInput.value),
    p_full_rate: toMoney(fullRateInput.value),
    p_guest_rate: toMoney(guestRateInput.value),
    p_feast_rate: toMoney(fridayFeastRateInput.value),
    p_effective_date: effectiveDate,
  };


  /*
   * userId is deliberately verified above.
   * Supabase RPC itself remains responsible for the
   * authenticated ownership check.
   */
  void userId;


  const {
    data,
    error,
  } = await supabase.rpc(
    "create_mess_with_owner",
    payload
  );


  if (error) {
    throw error;
  }


  if (!data) {
    throw new Error(
      "Mess তৈরি হয়েছে কিনা নিশ্চিত করা যায়নি।"
    );
  }

  const mess = {
    id: data,
    name: messNameInput.value.trim(),
    room_start: Number(roomStartInput.value),
    room_end: Number(roomEndInput.value),
    border_count: Number(borderCountInput.value),
  };

  return mess;
}


function normalizeCreatedMess(data) {
  if (!data) {
    return null;
  }


  if (
    typeof data === "object" &&
    !Array.isArray(data) &&
    data.id
  ) {
    return data;
  }


  if (
    Array.isArray(data) &&
    data.length > 0
  ) {
    return data[0];
  }


  /*
   * Some Postgres functions may return a JSON
   * object nested under a common property.
   */
  if (
    typeof data === "object"
  ) {
    if (data.mess) {
      return data.mess;
    }

    if (data.result) {
      return data.result;
    }

    if (data.data) {
      return data.data;
    }
  }


  return null;
}


/* =========================================================
   12. CREATE INITIAL MEMBERS
   ========================================================= */

async function createInitialMembers(messId) {
  const namedMembers =
    state.members.filter(
      (member) => member.name
    );


  if (!namedMembers.length) {
    return;
  }


  /*
   * Load generated rooms so each member can be linked
   * to the correct room UUID.
   */
  const {
    data: rooms,
    error: roomsError,
  } = await supabase
    .from("rooms")
    .select(
      "id, room_number"
    )
    .eq(
      "mess_id",
      messId
    )
    .order(
      "room_number",
      {
        ascending: true,
      }
    );


  if (roomsError) {
    throw roomsError;
  }


  const roomMap =
    new Map(
      (rooms ?? []).map(
        (room) => [
          Number(room.room_number),
          room.id,
        ]
      )
    );


  const today =
    getDhakaDateString();


  const rows =
    namedMembers.map(
      (member) => {
        const roomId =
          roomMap.get(
            Number(member.roomNumber)
          );

        if (!roomId) {
          throw new Error(
            `Room ${member.roomNumber} পাওয়া যায়নি।`
          );
        }


        return {
          mess_id: messId,
          room_id: roomId,
          name: member.name,
          active: member.active,
          joined_at: today,
          deactivated_at:
            member.active
              ? null
              : today,
        };
      }
    );


  const {
    error,
  } = await supabase
    .from("members")
    .insert(rows);


  if (error) {
    throw error;
  }
}


/* =========================================================
   13. FINISH SETUP
   ========================================================= */

async function finishSetup() {
  /*
   * Give the browser a moment to persist the auth/database
   * state before navigating.
   */
  await new Promise(
    (resolve) =>
      setTimeout(resolve, 100)
  );


  const dashboardUrl =
    buildDashboardUrl();


  window.location.assign(
    dashboardUrl
  );
}


/* =========================================================
   14. URL HELPERS
   ========================================================= */

function buildDashboardUrl() {
  return new URL(
    "../index.html",
    window.location.href
  ).href;
}


/* =========================================================
   15. ERROR HANDLING
   ========================================================= */

function clearGlobalError() {
  if (!setupError) {
    return;
  }

  setupError.textContent = "";
  setupError.hidden = true;
}


function showGlobalError(message) {
  if (!setupError) {
    return;
  }

  setupError.textContent =
    String(message);

  setupError.hidden = false;

  setupError.scrollIntoView({
    behavior: "smooth",
    block: "center",
  });
}


function clearFieldErrors() {
  $$(".form-error").forEach(
    (element) => {
      element.textContent = "";
    }
  );
}


function setFieldError(
  id,
  message
) {
  const element =
    $(`#${id}-error`);

  if (element) {
    element.textContent =
      String(message);
  }
}


function getFriendlyErrorMessage(error) {
  const normalized =
    normalizeSupabaseError(error);


  if (
    normalized?.message
  ) {
    return normalized.message;
  }


  const message =
    error?.message ?? "";


  if (
    /duplicate/i.test(message)
  ) {
    return "এই তথ্যটি আগে থেকেই আছে।";
  }


  if (
    /permission|policy|rls|row-level/i.test(
      message
    )
  ) {
    return "এই কাজ করার অনুমতি পাওয়া যায়নি।";
  }


  if (
    /network|fetch|failed to fetch/i.test(
      message
    )
  ) {
    return "Internet connection পরীক্ষা করে আবার চেষ্টা করুন।";
  }


  return (
    message ||
    "Mess তৈরি করা যায়নি। আবার চেষ্টা করুন।"
  );
}


/* =========================================================
   16. SUBMIT UI
   ========================================================= */

function setSubmitLoading(isLoading) {
  if (!setupSubmit) {
    return;
  }


  setupSubmit.disabled =
    isLoading;


  setupSubmit.setAttribute(
    "aria-busy",
    String(isLoading)
  );


  setupSubmit.innerHTML =
    isLoading
      ? `
        <span
          class="loading-spinner"
          aria-hidden="true"
        ></span>
        Creating Mess...
      `
      : `
        Create Mess
        <span aria-hidden="true">✓</span>
      `;
}


/* =========================================================
   17. UTILS
   ========================================================= */

function toMoney(value) {
  const number =
    Number(value);

  if (
    !Number.isFinite(number)
  ) {
    return 0;
  }

  return Math.round(
    number * 100
  ) / 100;
}


function getDhakaDateString() {
  const formatter =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          APP_CONFIG.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    );


  return formatter.format(
    new Date()
  );
}


/* =========================================================
   18. EXPOSE READ-ONLY SETUP STATE
   ========================================================= */

export function getSetupState() {
  return Object.freeze({
    currentStep:
      state.currentStep,

    rooms:
      [...state.rooms],

    members:
      state.members.map(
        (member) => ({
          ...member,
        })
      ),

    createdMess:
      state.createdMess
        ? {
          ...state.createdMess,
        }
        : null,

    submitting:
      state.submitting,
  });
}
