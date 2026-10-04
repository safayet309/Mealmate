/* =========================================================
   Mealmate — Members & Rooms
   File: js/members.js

   Responsibilities:
   - Resolve current Mess
   - Load rooms
   - Load members
   - Search/filter members
   - Add member
   - Edit member
   - Deactivate member
   - Reactivate member
   - Keep room assignment intact
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

  rooms: [],
  members: [],

  filter: {
    search: "",
    status: "active",
  },

  editingMemberId: null,
};


/* =========================================================
   DOM
   ========================================================= */

const dom = {
  messName:
    document.querySelector(
      '[data-members="mess-name"]'
    ),

  roomRange:
    document.querySelector(
      '[data-members="room-range"]'
    ),

  roomCount:
    document.querySelector(
      '[data-members="room-count"]'
    ),

  activeCount:
    document.querySelector(
      '[data-members="active-count"]'
    ),

  inactiveCount:
    document.querySelector(
      '[data-members="inactive-count"]'
    ),

  visibleCount:
    document.querySelector(
      '[data-members="visible-count"]'
    ),

  list:
    document.querySelector(
      "[data-members-list]"
    ),

  empty:
    document.querySelector(
      "[data-members-empty]"
    ),

  search:
    document.querySelector(
      "[data-members-search]"
    ),

  status:
    document.querySelector(
      "[data-members-status-filter]"
    ),

  tableWrapper:
    document.querySelector(
      "[data-members-table-wrapper]"
    ),

  addButtons:
    document.querySelectorAll(
      '[data-action="add-member"]'
    ),

  modalRoot:
    document.querySelector(
      "#modal-root"
    ),
};


/* =========================================================
   START
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  initializeMembersPage
);


/* =========================================================
   INITIALIZE
   ========================================================= */

async function initializeMembersPage() {

  if (!isMembersPage()) {
    return;
  }


  try {

    const user =
      await getCurrentUser();


    if (!user) {
      redirectToLogin();

      return;
    }


    state.user = user;


    bindEvents();


    await loadMembersData();


    renderPage();

  } catch (error) {

    console.error(
      "[Mealmate] Members initialization error:",
      error
    );

    showLoadError(error);
  }
}


/* =========================================================
   PAGE CHECK
   ========================================================= */

function isMembersPage() {

  return (
    window.location.pathname
      .replace(/\\/g, "/")
      .endsWith(
        "/pages/members.html"
      )
  );
}


/* =========================================================
   EVENTS
   ========================================================= */

function bindEvents() {

  dom.search?.addEventListener(
    "input",
    () => {

      state.filter.search =
        dom.search.value
          .trim()
          .toLowerCase();

      renderMemberList();
    }
  );


  dom.status?.addEventListener(
    "change",
    () => {

      state.filter.status =
        dom.status.value;

      renderMemberList();
    }
  );


  dom.addButtons.forEach(
    (button) => {

      button.addEventListener(
        "click",
        () => {
          openMemberModal();
        }
      );
    }
  );


  dom.list?.addEventListener(
    "click",
    handleMemberAction
  );


  document.addEventListener(
    "keydown",
    (event) => {

      if (
        event.key === "Escape"
      ) {
        closeMemberModal();
      }
    }
  );
}


/* =========================================================
   LOAD DATA
   ========================================================= */

async function loadMembersData() {

  const userId =
    state.user?.id;


  if (!userId) {
    return;
  }


  /*
   * -------------------------------------------------------
   * Find the user's Mess records.
   * Multiple test Mess rows may exist, so prefer the
   * Mess containing the most active members.
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


  if (
    !Array.isArray(messes) ||
    !messes.length
  ) {

    state.mess = null;
    state.rooms = [];
    state.members = [];

    return;
  }


  const messIds =
    messes
      .map(
        (mess) => mess.id
      )
      .filter(Boolean);


  const {
    data: memberRows,
    error: memberRowsError,
  } = await supabase
    .from("members")
    .select(`
      id,
      mess_id,
      room_id,
      name,
      active,
      joined_at,
      deactivated_at,
      created_at,
      updated_at
    `)
    .in(
      "mess_id",
      messIds
    );


  if (memberRowsError) {
    throw memberRowsError;
  }


  /*
   * Pick the Mess with the highest number of active members.
   * If equal, newest Mess wins.
   */

  const memberCountByMess =
    new Map();


  for (
    const member of
      memberRows ?? []
  ) {

    if (!member?.active) {
      continue;
    }


    memberCountByMess.set(
      member.mess_id,
      (
        memberCountByMess.get(
          member.mess_id
        ) ?? 0
      ) + 1
    );
  }


  const sortedMesses =
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
    sortedMesses[0] ?? null;


  if (!state.mess) {
    return;
  }


  const messId =
    state.mess.id;


  /*
   * -------------------------------------------------------
   * Rooms
   * -------------------------------------------------------
   */

  const {
    data: rooms,
    error: roomsError,
  } = await supabase
    .from("rooms")
    .select(`
      id,
      mess_id,
      room_number,
      active,
      created_at
    `)
    .eq("mess_id", messId)
    .order("room_number", {
      ascending: true,
    });


  if (roomsError) {
    throw roomsError;
  }


  /*
   * -------------------------------------------------------
   * Members
   * -------------------------------------------------------
   */

  const {
    data: members,
    error: membersError,
  } = await supabase
    .from("members")
    .select(`
      id,
      mess_id,
      room_id,
      name,
      active,
      joined_at,
      deactivated_at,
      created_at,
      updated_at
    `)
    .eq("mess_id", messId)
    .order("active", {
      ascending: false,
    })
    .order("name", {
      ascending: true,
    });


  if (membersError) {
    throw membersError;
  }


  state.rooms =
    rooms ?? [];

  state.members =
    members ?? [];
}


/* =========================================================
   RENDER PAGE
   ========================================================= */

function renderPage() {

  if (!state.mess) {

    renderNoMessState();

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


  if (dom.roomCount) {

    dom.roomCount.textContent =
      state.rooms.filter(
        (room) => room.active
      ).length;
  }


  if (dom.activeCount) {

    dom.activeCount.textContent =
      state.members.filter(
        (member) => member.active
      ).length;
  }


  if (dom.inactiveCount) {

    dom.inactiveCount.textContent =
      state.members.filter(
        (member) => !member.active
      ).length;
  }


  renderMemberList();
}


/* =========================================================
   MEMBER LIST
   ========================================================= */

function renderMemberList() {

  if (!dom.list) {
    return;
  }


  const filtered =
    state.members.filter(
      matchesCurrentFilter
    );


  if (dom.visibleCount) {

    dom.visibleCount.textContent =
      filtered.length;
  }


  if (
    dom.tableWrapper
  ) {

    dom.tableWrapper.hidden =
      filtered.length === 0;
  }


  if (dom.empty) {

    dom.empty.hidden =
      filtered.length !== 0;
  }


  if (!filtered.length) {

    dom.list.innerHTML =
      "";

    return;
  }


  dom.list.innerHTML =
    filtered
      .map(
        renderMemberRow
      )
      .join("");
}


/* =========================================================
   FILTER
   ========================================================= */

function matchesCurrentFilter(
  member
) {

  const status =
    state.filter.status;


  if (
    status === "active" &&
    !member.active
  ) {

    return false;
  }


  if (
    status === "inactive" &&
    member.active
  ) {

    return false;
  }


  const search =
    state.filter.search;


  if (!search) {
    return true;
  }


  return (
    member.name
      .toLowerCase()
      .includes(search)
    ||
    getRoomNumber(
      member.room_id
    )
      .toString()
      .includes(search)
  );
}


/* =========================================================
   ROW
   ========================================================= */

function renderMemberRow(
  member
) {

  const roomNumber =
    getRoomNumber(
      member.room_id
    );


  const statusLabel =
    member.active
      ? "Active"
      : "Inactive";


  const statusClass =
    member.active
      ? "badge--success"
      : "badge--muted";


  const actionButton =
    member.active

      ? `
        <button
          class="button button--secondary"
          type="button"
          data-member-action="edit"
          data-member-id="${escapeAttribute(member.id)}"
        >
          Edit
        </button>

        <button
          class="button button--danger"
          type="button"
          data-member-action="deactivate"
          data-member-id="${escapeAttribute(member.id)}"
        >
          Deactivate
        </button>
      `

      : `
        <button
          class="button button--primary"
          type="button"
          data-member-action="reactivate"
          data-member-id="${escapeAttribute(member.id)}"
        >
          Reactivate
        </button>
      `;


  return `
    <tr>

      <td>
        ${escapeHtml(
          roomNumber || "—"
        )}
      </td>

      <td>
        <strong>
          ${escapeHtml(
            member.name
          )}
        </strong>
      </td>

      <td>
        <span
          class="badge ${statusClass}"
        >
          ${statusLabel}
        </span>
      </td>

      <td>
        ${formatDate(
          member.joined_at
        )}
      </td>

      <td class="text-right">
        <div
          class="table-actions"
        >
          ${actionButton}
        </div>
      </td>

    </tr>
  `;
}


/* =========================================================
   MEMBER ACTIONS
   ========================================================= */

async function handleMemberAction(
  event
) {

  const button =
    event.target.closest(
      "[data-member-action]"
    );


  if (!button) {
    return;
  }


  const memberId =
    button.dataset.memberId;


  const action =
    button.dataset.memberAction;


  if (!memberId) {
    return;
  }


  const member =
    state.members.find(
      (item) =>
        item.id === memberId
    );


  if (!member) {
    return;
  }


  try {

    button.disabled = true;


    switch (action) {

      case "edit":

        openMemberModal(member);

        break;


      case "deactivate":

        await deactivateMember(
          member
        );

        break;


      case "reactivate":

        await reactivateMember(
          member
        );

        break;


      default:

        break;
    }

  } catch (error) {

    console.error(
      "[Mealmate] Member action error:",
      error
    );


    showToast(
      getFriendlyError(
        error
      ),
      "error"
    );

  } finally {

    button.disabled = false;
  }
}


/* =========================================================
   ADD / EDIT MODAL
   ========================================================= */

function openMemberModal(
  member = null
) {

  if (!dom.modalRoot) {
    return;
  }


  state.editingMemberId =
    member?.id ?? null;


  const isEditing =
    Boolean(member);


  const roomOptions =
    state.rooms
      .filter(
        (room) =>
          room.active
      )
      .map(
        (room) => `
          <option
            value="${escapeAttribute(room.id)}"
            ${
              member?.room_id ===
              room.id
                ? "selected"
                : ""
            }
          >
            Room ${escapeHtml(
              room.room_number
            )}
          </option>
        `
      )
      .join("");


  dom.modalRoot.innerHTML = `
    <div
      class="modal-backdrop"
      data-member-modal-backdrop
    >

      <div
        class="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-modal-title"
      >

        <div class="modal__header">

          <div>

            <p class="eyebrow">
              MEMBER
            </p>

            <h2 id="member-modal-title">
              ${
                isEditing
                  ? "Edit Member"
                  : "Add Member"
              }
            </h2>

          </div>

          <button
            class="icon-button"
            type="button"
            data-member-modal-close
            aria-label="Close"
          >
            ×
          </button>

        </div>


        <form
          class="modal__body"
          data-member-form
        >

          <div class="field">

            <label
              class="field__label"
              for="member-name-input"
            >
              Member Name
            </label>

            <input
              id="member-name-input"
              class="input"
              type="text"
              maxlength="100"
              required
              autocomplete="off"
              placeholder="Member name"
              value="${escapeAttribute(
                member?.name ?? ""
              )}"
            >

            <p
              class="form-error"
              data-member-name-error
            ></p>

          </div>


          <div class="field">

            <label
              class="field__label"
              for="member-room-input"
            >
              Room
            </label>

            <select
              id="member-room-input"
              class="input"
              required
            >

              <option
                value=""
              >
                Select room
              </option>

              ${roomOptions}

            </select>

            <p
              class="form-error"
              data-member-room-error
            ></p>

          </div>


          <div
            class="modal__actions"
          >

            <button
              class="button button--secondary"
              type="button"
              data-member-modal-close
            >
              Cancel
            </button>

            <button
              class="button button--primary"
              type="submit"
              data-member-save
            >
              ${
                isEditing
                  ? "Save Changes"
                  : "Add Member"
              }
            </button>

          </div>

        </form>

      </div>

    </div>
  `;


  const backdrop =
    dom.modalRoot.querySelector(
      "[data-member-modal-backdrop]"
    );


  const form =
    dom.modalRoot.querySelector(
      "[data-member-form]"
    );


  const closeButtons =
    dom.modalRoot.querySelectorAll(
      "[data-member-modal-close]"
    );


  closeButtons.forEach(
    (button) => {

      button.addEventListener(
        "click",
        closeMemberModal
      );
    }
  );


  backdrop?.addEventListener(
    "click",
    (event) => {

      if (
        event.target ===
        backdrop
      ) {

        closeMemberModal();
      }
    }
  );


  form?.addEventListener(
    "submit",
    handleMemberFormSubmit
  );


  setTimeout(
    () => {

      document
        .querySelector(
          "#member-name-input"
        )
        ?.focus();

    },
    0
  );
}


/* =========================================================
   CLOSE MODAL
   ========================================================= */

function closeMemberModal() {

  if (!dom.modalRoot) {
    return;
  }


  dom.modalRoot.innerHTML =
    "";

  state.editingMemberId =
    null;
}


/* =========================================================
   FORM SUBMIT
   ========================================================= */

async function handleMemberFormSubmit(
  event
) {

  event.preventDefault();


  const form =
    event.currentTarget;


  const nameInput =
    form.querySelector(
      "#member-name-input"
    );


  const roomInput =
    form.querySelector(
      "#member-room-input"
    );


  const nameError =
    form.querySelector(
      "[data-member-name-error]"
    );


  const roomError =
    form.querySelector(
      "[data-member-room-error]"
    );


  const saveButton =
    form.querySelector(
      "[data-member-save]"
    );


  nameError.textContent =
    "";

  roomError.textContent =
    "";


  const name =
    nameInput.value.trim();


  const roomId =
    roomInput.value;


  let valid = true;


  if (
    name.length < 1 ||
    name.length > 100
  ) {

    nameError.textContent =
      "Member name 1–100 characters হতে হবে।";

    valid = false;
  }


  if (!roomId) {

    roomError.textContent =
      "একটি Room নির্বাচন করুন।";

    valid = false;
  }


  if (!valid) {
    return;
  }


  /*
   * Prevent duplicate active member names.
   */

  const duplicate =
    state.members.find(
      (member) =>
        member.active &&
        member.id !==
          state.editingMemberId &&
        member.name
          .trim()
          .toLowerCase() ===
          name.toLowerCase()
    );


  if (duplicate) {

    nameError.textContent =
      "এই নামে একজন Active Member ইতিমধ্যে আছে।";

    return;
  }


  try {

    saveButton.disabled = true;

    saveButton.textContent =
      "Saving…";


    if (
      state.editingMemberId
    ) {

      await updateMember(
        state.editingMemberId,
        {
          name,
          room_id: roomId,
        }
      );


      showToast(
        "Member update হয়েছে।",
        "success"
      );

    } else {

      await addMember(
        name,
        roomId
      );


      showToast(
        "Member যোগ হয়েছে।",
        "success"
      );
    }


    closeMemberModal();


    await loadMembersData();

    renderPage();

  } catch (error) {

    console.error(
      "[Mealmate] Member save error:",
      error
    );


    showToast(
      getFriendlyError(
        error
      ),
      "error"
    );

  } finally {

    saveButton.disabled =
      false;
  }
}


/* =========================================================
   ADD MEMBER
   ========================================================= */

async function addMember(
  name,
  roomId
) {

  if (!state.mess?.id) {

    throw new Error(
      "Current Mess পাওয়া যায়নি।"
    );
  }


  const {
    error,
  } = await supabase
    .from("members")
    .insert({
      mess_id:
        state.mess.id,

      room_id:
        roomId,

      name,

      active:
        true,

      joined_at:
        getTodayDateString(),

      deactivated_at:
        null,
    });


  if (error) {
    throw error;
  }
}


/* =========================================================
   UPDATE MEMBER
   ========================================================= */

async function updateMember(
  memberId,
  values
) {

  const {
    error,
  } = await supabase
    .from("members")
    .update({
      name:
        values.name,

      room_id:
        values.room_id,

      updated_at:
        new Date()
          .toISOString(),
    })
    .eq(
      "id",
      memberId
    )
    .eq(
      "mess_id",
      state.mess.id
    );


  if (error) {
    throw error;
  }
}


/* =========================================================
   DEACTIVATE
   ========================================================= */

async function deactivateMember(
  member
) {

  const confirmed =
    window.confirm(
      `আপনি কি "${member.name}"-কে Deactivate করতে চান?`
    );


  if (!confirmed) {
    return;
  }


  const {
    error,
  } = await supabase
    .from("members")
    .update({
      active:
        false,

      deactivated_at:
        getTodayDateString(),

      updated_at:
        new Date()
          .toISOString(),
    })
    .eq(
      "id",
      member.id
    )
    .eq(
      "mess_id",
      state.mess.id
    );


  if (error) {
    throw error;
  }


  showToast(
    "Member deactivate হয়েছে।",
    "success"
  );


  await loadMembersData();

  renderPage();
}


/* =========================================================
   REACTIVATE
   ========================================================= */

async function reactivateMember(
  member
) {

  const confirmed =
    window.confirm(
      `আপনি কি "${member.name}"-কে আবার Active করতে চান?`
    );


  if (!confirmed) {
    return;
  }


  /*
   * Active duplicate check.
   */

  const duplicate =
    state.members.find(
      (item) =>
        item.active &&
        item.id !== member.id &&
        item.name
          .trim()
          .toLowerCase() ===
          member.name
            .trim()
            .toLowerCase()
    );


  if (duplicate) {

    showToast(
      "এই নামে ইতিমধ্যে Active Member আছে।",
      "error"
    );

    return;
  }


  const {
    error,
  } = await supabase
    .from("members")
    .update({
      active:
        true,

      deactivated_at:
        null,

      updated_at:
        new Date()
          .toISOString(),
    })
    .eq(
      "id",
      member.id
    )
    .eq(
      "mess_id",
      state.mess.id
    );


  if (error) {
    throw error;
  }


  showToast(
    "Member আবার Active হয়েছে।",
    "success"
  );


  await loadMembersData();

  renderPage();
}


/* =========================================================
   ROOM HELPERS
   ========================================================= */

function getRoomNumber(
  roomId
) {

  const room =
    state.rooms.find(
      (item) =>
        item.id === roomId
    );


  return (
    room?.room_number ??
    ""
  );
}


/* =========================================================
   DATE HELPERS
   ========================================================= */

function getTodayDateString() {

  const today =
    new Date();


  const year =
    today.getFullYear();


  const month =
    String(
      today.getMonth() + 1
    ).padStart(
      2,
      "0"
    );


  const day =
    String(
      today.getDate()
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
   ERROR / EMPTY
   ========================================================= */

function renderNoMessState() {

  if (dom.messName) {
    dom.messName.textContent =
      "কোনো Mess পাওয়া যায়নি";
  }


  if (dom.roomRange) {
    dom.roomRange.textContent =
      "—";
  }


  if (dom.roomCount) {
    dom.roomCount.textContent =
      "0";
  }


  if (dom.activeCount) {
    dom.activeCount.textContent =
      "0";
  }


  if (dom.inactiveCount) {
    dom.inactiveCount.textContent =
      "0";
  }


  if (dom.tableWrapper) {
    dom.tableWrapper.hidden =
      true;
  }


  if (dom.empty) {
    dom.empty.hidden =
      false;
  }
}


function showLoadError(
  error
) {

  if (dom.messName) {

    dom.messName.textContent =
      "Data Load Error";

    dom.messName.title =
      String(
        error?.message ??
        error ??
        "Unknown error"
      );
  }


  showToast(
    getFriendlyError(
      error
    ),
    "error"
  );
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
   ERROR NORMALIZATION
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
      error?.message ??
      ""
    );


  if (
    code === "23505"
  ) {

    return (
      "এই তথ্যটি আগে থেকেই আছে।"
    );
  }


  if (
    code === "42501" ||
    /row-level security|permission/i.test(
      message
    )
  ) {

    return (
      "এই কাজ করার অনুমতি পাওয়া যায়নি।"
    );
  }


  if (
    code === "23503"
  ) {

    return (
      "Room বা Member relation সঠিক নয়।"
    );
  }


  if (
    code === "23514"
  ) {

    return (
      "তথ্য validation ব্যর্থ হয়েছে।"
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
    "কাজটি সম্পন্ন করা যায়নি।"
  );
}


/* =========================================================
   SECURITY-SAFE HTML HELPERS
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


function escapeAttribute(
  value
) {

  return escapeHtml(
    value
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
