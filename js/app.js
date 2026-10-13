const TRANSACTIONS_STORAGE_KEY = "finance-tracker-transactions";

/** Reads and validates transactions saved by this app before the first render. */
function loadTransactions() {
  let savedTransactions;

  try {
    savedTransactions = localStorage.getItem(TRANSACTIONS_STORAGE_KEY);
  } catch {
    return { transactions: [], error: "storage-unavailable" };
  }

  if (savedTransactions === null) {
    return { transactions: [], error: null };
  }

  let parsedTransactions;
  try {
    parsedTransactions = JSON.parse(savedTransactions);
  } catch {
    return { transactions: [], error: "invalid-data" };
  }

  const isValidList =
    Array.isArray(parsedTransactions) && parsedTransactions.every(isStoredTransaction);

  if (!isValidList) {
    return { transactions: [], error: "invalid-data" };
  }

  return { transactions: parsedTransactions, error: null };
}

/** Checks the stored record shape before it is passed to rendering and totals. */
function isStoredTransaction(transaction) {
  return (
    transaction !== null &&
    typeof transaction === "object" &&
    typeof transaction.transaction_id === "string" &&
    typeof transaction.title === "string" &&
    Number.isFinite(transaction.amount) &&
    transaction.amount > 0 &&
    typeof transaction.category === "string" &&
    isValidDate(transaction.date) &&
    (transaction.type === "income" || transaction.type === "expense")
  );
}

const initialTransactionLoad = loadTransactions();
const transactions = initialTransactionLoad.transactions;

const form = document.querySelector("#transaction-form");
const formMessage = document.querySelector("#form-message");
const formEyebrow = document.querySelector("#form-eyebrow");
const formHeading = document.querySelector("#form-heading");
const submitButton = form.querySelector("[type='submit']");
const cancelEditButton = document.querySelector("#cancel-edit-button");
const storageMessage = document.querySelector("#storage-message");
const deleteDialog = document.querySelector("#delete-dialog");
const deleteDialogTransaction = document.querySelector("#delete-dialog-transaction");
const cancelDeleteButton = document.querySelector("#cancel-delete-button");
const confirmDeleteButton = document.querySelector("#confirm-delete-button");
const emptyState = document.querySelector("#empty-state");
const tableContainer = document.querySelector("#table-container");
const transactionRows = document.querySelector("#transaction-rows");
const typeFilter = document.querySelector("#type-filter");
const categoryFilter = document.querySelector("#category-filter");
const titleSearch = document.querySelector("#title-search");
const dateSortHeading = document.querySelector("#date-sort-heading");
const dateSortButton = document.querySelector("#date-sort-button");
const dateSortIndicator = document.querySelector("#date-sort-indicator");
const amountSortHeading = document.querySelector("#amount-sort-heading");
const amountSortButton = document.querySelector("#amount-sort-button");
const amountSortIndicator = document.querySelector("#amount-sort-indicator");
const dateFilter = document.querySelector("#date-filter");
const specificMonthField = document.querySelector("#specific-month-field");
const monthFilter = document.querySelector("#month-filter");
const totalBalance = document.querySelector("#total-balance");
const totalIncome = document.querySelector("#total-income");
const totalExpense = document.querySelector("#total-expense");
let editingTransactionId = null;
let pendingDeleteId = null;
let activeSort = null;

/**
 * Checks the calendar date without allowing JavaScript to normalize invalid dates.
 * @param {string} value Date string from the native date input.
 * @returns {boolean} Whether the value is a real YYYY-MM-DD calendar date.
 */
function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Saves the source transaction list, leaving search and sort state out of storage. */
function saveTransactions() {
  try {
    localStorage.setItem(TRANSACTIONS_STORAGE_KEY, JSON.stringify(transactions));
    storageMessage.hidden = true;
    storageMessage.textContent = "";
  } catch {
    storageMessage.textContent =
      "Your changes are visible for this session but could not be saved. They may be lost on refresh.";
    storageMessage.hidden = false;
  }
}

/**
 * Builds a normalized transaction from the current form values.
 * @param {HTMLFormElement} transactionForm Form containing transaction fields.
 * @param {string | null} [transactionId=null] Existing ID to retain when editing a record.
 * @returns {{ transaction: object | null, error: string | null }} Normalized data or validation error.
 */
function readTransaction(transactionForm, transactionId = null) {
  const title = transactionForm.elements.title.value.trim();
  const amountText = transactionForm.elements.amount.value.trim();
  const category = transactionForm.elements.category.value.trim();
  const date = transactionForm.elements.date.value;
  const type = transactionForm.elements.type.value;
  const amount = Number(amountText);

  if (!title) {
    return { transaction: null, error: "Enter a title." };
  }

  if (!amountText || !Number.isFinite(amount) || amount <= 0) {
    return { transaction: null, error: "Enter an amount greater than zero." };
  }

  if (!category) {
    return { transaction: null, error: "Enter a category." };
  }

  if (!isValidDate(date)) {
    return { transaction: null, error: "Choose a valid date." };
  }

  if (type !== "income" && type !== "expense") {
    return { transaction: null, error: "Choose Income or Expense." };
  }

  return {
    transaction: {
      transaction_id: transactionId ?? crypto.randomUUID(),
      title,
      amount,
      category,
      date,
      type,
    },
    error: null,
  };
}

/** Adds one cell to a table row using textContent for user-provided values. */
function addCell(row, text) {
  const cell = document.createElement("td");
  cell.textContent = text;
  row.append(cell);
}

/** Converts a positive finite Number's decimal text to integer units and a scale. */
function getDecimalParts(amount) {
  const [coefficient, exponentText] = String(amount).toLowerCase().split("e");
  const exponent = exponentText === undefined ? 0 : Number(exponentText);
  const [whole, fraction = ""] = coefficient.split(".");
  let units = BigInt(`${whole}${fraction}`);
  let scale = fraction.length - exponent;

  if (scale < 0) {
    units *= 10n ** BigInt(-scale);
    scale = 0;
  }

  return { units, scale };
}

/** Formats a signed integer amount at a decimal scale without fixed trailing zeroes. */
function formatDecimalUnits(units, scale) {
  const sign = units < 0n ? "-" : "";
  const absoluteUnits = units < 0n ? -units : units;
  const divisor = 10n ** BigInt(scale);
  const whole = absoluteUnits / divisor;
  const fraction = String(absoluteUnits % divisor).padStart(scale, "0").replace(/0+$/, "");

  return fraction ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
}

/** Switches between adding a transaction and editing an existing one. */
function setFormMode(transaction = null) {
  editingTransactionId = transaction?.transaction_id ?? null;
  formMessage.textContent = "";

  if (transaction) {
    formEyebrow.textContent = "Selected entry";
    formHeading.textContent = "Edit a transaction";
    submitButton.textContent = "Save changes";
    cancelEditButton.hidden = false;
    form.elements.title.value = transaction.title;
    form.elements.amount.value = String(transaction.amount);
    form.elements.category.value = transaction.category;
    form.elements.date.value = transaction.date;
    form.elements.type.value = transaction.type;
  } else {
    form.reset();
    formEyebrow.textContent = "New entry";
    formHeading.textContent = "Add a transaction";
    submitButton.textContent = "Add transaction";
    cancelEditButton.hidden = true;
  }

  renderTransactions();
  form.elements.title.focus();
}

/** Loads the selected transaction into the form without changing stored data. */
function startEditing(transactionId) {
  const transaction = transactions.find((item) => item.transaction_id === transactionId);
  if (!transaction) {
    return;
  }

  setFormMode(transaction);
}

/** Gives focus back to the matching transaction action after the table rerenders. */
function focusTransactionAction(action, transactionId) {
  const button = Array.from(transactionRows.querySelectorAll("button")).find(
    (item) => item.dataset.action === action && item.dataset.transactionId === transactionId,
  );
  button?.focus();
}

/** Opens a modal confirmation for one transaction. */
function requestDelete(transactionId) {
  if (editingTransactionId !== null || pendingDeleteId !== null) {
    return;
  }

  const transaction = transactions.find((item) => item.transaction_id === transactionId);
  if (!transaction) {
    return;
  }

  pendingDeleteId = transactionId;
  deleteDialogTransaction.textContent = transaction.title;
  renderTransactions();
  deleteDialog.showModal();
  cancelDeleteButton.focus();
}

/** Closes the modal without changing the transaction list. */
function cancelDelete() {
  if (pendingDeleteId === null) {
    return;
  }

  const transactionId = pendingDeleteId;
  pendingDeleteId = null;
  if (deleteDialog.open) {
    deleteDialog.close();
  }
  renderTransactions();
  focusTransactionAction("delete", transactionId);
}

/** Removes only the transaction identified by the active modal confirmation. */
function confirmDelete() {
  if (pendingDeleteId === null) {
    return;
  }

  const transactionId = pendingDeleteId;
  const transactionIndex = transactions.findIndex(
    (transaction) => transaction.transaction_id === transactionId,
  );

  if (transactionIndex === -1) {
    pendingDeleteId = null;
    if (deleteDialog.open) {
      deleteDialog.close();
    }
    renderTransactions();
    return;
  }

  transactions.splice(transactionIndex, 1);
  saveTransactions();
  pendingDeleteId = null;
  if (deleteDialog.open) {
    deleteDialog.close();
  }
  renderTransactions();

  const nextTransaction = transactions[Math.min(transactionIndex, transactions.length - 1)];
  if (nextTransaction) {
    focusTransactionAction("delete", nextTransaction.transaction_id);
  } else {
    emptyState.focus();
  }
}

/** Rebuilds category options while preserving the active selection. */
function updateCategoryFilterOptions() {
  const selectedCategory = categoryFilter.value;
  const categories = new Set(transactions.map((transaction) => transaction.category));

  if (selectedCategory) {
    categories.add(selectedCategory);
  }

  categoryFilter.replaceChildren();

  const allCategoriesOption = document.createElement("option");
  allCategoriesOption.value = "";
  allCategoriesOption.textContent = "All categories";
  categoryFilter.append(allCategoriesOption);

  for (const category of categories) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    categoryFilter.append(option);
  }

  categoryFilter.value = selectedCategory;
}

/** Formats a date as a local calendar-month value (YYYY-MM). */
function getMonthValue(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}

/** Shows the month picker only for the specific-month option. */
function updateDateFilterControls() {
  const isSpecificMonth = dateFilter.value === "specific-month";
  specificMonthField.hidden = !isSpecificMonth;

  if (isSpecificMonth && !monthFilter.value) {
    monthFilter.value = getMonthValue(new Date());
  }
}

/** Resolves the active date option to a month or null when dates are unrestricted. */
function getSelectedMonth() {
  if (dateFilter.value === "this-month") {
    return getMonthValue(new Date());
  }

  if (dateFilter.value === "last-month") {
    const today = new Date();
    const previousMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return getMonthValue(previousMonth);
  }

  if (dateFilter.value === "specific-month") {
    return monthFilter.value;
  }

  return null;
}

/** Returns a combined search/type/category/date view without changing the source list. */
function getVisibleTransactions() {
  const titleQuery = titleSearch.value.trim().toLowerCase();
  const selectedMonth = getSelectedMonth();

  if (
    titleQuery === "" &&
    typeFilter.value === "all" &&
    categoryFilter.value === "" &&
    selectedMonth === null
  ) {
    return transactions;
  }

  return transactions.filter((transaction) => {
    const matchesTitle = transaction.title.toLowerCase().includes(titleQuery);
    const matchesType = typeFilter.value === "all" || transaction.type === typeFilter.value;
    const matchesCategory = categoryFilter.value === "" || transaction.category === categoryFilter.value;
    const matchesDate = selectedMonth === null || transaction.date.slice(0, 7) === selectedMonth;

    return matchesTitle && matchesType && matchesCategory && matchesDate;
  });
}

/** Toggles the selected sort; choosing another column starts with descending order. */
function toggleSort(key) {
  if (activeSort?.key === key) {
    activeSort.direction = activeSort.direction === "desc" ? "asc" : "desc";
  } else {
    activeSort = { key, direction: "desc" };
  }

  renderTransactions();
}

/** Sorts a copy of the filtered view, preserving source order and stable ties. */
function getSortedTransactions(visibleTransactions) {
  if (activeSort === null) {
    return visibleTransactions;
  }

  return [...visibleTransactions].sort((left, right) => {
    const comparison =
      activeSort.key === "date"
        ? left.date.localeCompare(right.date)
        : left.amount - right.amount;

    return activeSort.direction === "asc" ? comparison : -comparison;
  });
}

/** Updates visible arrows and accessible sort state for both sortable columns. */
function updateSortControls() {
  const dateIsActive = activeSort?.key === "date";
  const amountIsActive = activeSort?.key === "amount";

  dateSortHeading.setAttribute(
    "aria-sort",
    dateIsActive ? (activeSort.direction === "asc" ? "ascending" : "descending") : "none",
  );
  dateSortButton.setAttribute("aria-pressed", String(dateIsActive));
  dateSortButton.setAttribute(
    "aria-label",
    dateIsActive
      ? activeSort.direction === "desc"
        ? "Sorted by date, latest first. Activate to sort oldest first."
        : "Sorted by date, oldest first. Activate to sort latest first."
      : "Sort by date, latest first",
  );
  dateSortIndicator.textContent = dateIsActive
    ? activeSort.direction === "desc"
      ? "↓"
      : "↑"
    : "↕";

  amountSortHeading.setAttribute(
    "aria-sort",
    amountIsActive ? (activeSort.direction === "asc" ? "ascending" : "descending") : "none",
  );
  amountSortButton.setAttribute("aria-pressed", String(amountIsActive));
  amountSortButton.setAttribute(
    "aria-label",
    amountIsActive
      ? activeSort.direction === "desc"
        ? "Sorted by amount, highest first. Activate to sort lowest first."
        : "Sorted by amount, lowest first. Activate to sort highest first."
      : "Sort by amount, highest first",
  );
  amountSortIndicator.textContent = amountIsActive
    ? activeSort.direction === "desc"
      ? "↓"
      : "↑"
    : "↕";
}

/** Recalculates dashboard totals from visible transactions using decimal-safe integer sums. */
function renderDashboard(visibleTransactions) {
  const decimalAmounts = visibleTransactions.map((transaction) => getDecimalParts(transaction.amount));
  const scale = decimalAmounts.reduce((largest, amount) => Math.max(largest, amount.scale), 0);
  let incomeUnits = 0n;
  let expenseUnits = 0n;

  visibleTransactions.forEach((transaction, index) => {
    const amount = decimalAmounts[index];
    const scaledUnits = amount.units * 10n ** BigInt(scale - amount.scale);

    if (transaction.type === "income") {
      incomeUnits += scaledUnits;
    } else {
      expenseUnits += scaledUnits;
    }
  });

  totalBalance.textContent = formatDecimalUnits(incomeUnits - expenseUnits, scale);
  totalIncome.textContent = formatDecimalUnits(incomeUnits, scale);
  totalExpense.textContent = formatDecimalUnits(expenseUnits, scale);
}

/** Renders the current filtered view of the in-memory transaction list. */
function renderTransactions() {
  updateCategoryFilterOptions();
  updateDateFilterControls();
  updateSortControls();
  const visibleTransactions = getVisibleTransactions();
  const sortedTransactions = getSortedTransactions(visibleTransactions);
  transactionRows.replaceChildren();
  emptyState.hidden = visibleTransactions.length > 0;
  tableContainer.hidden = visibleTransactions.length === 0;

  const filtersAreClear =
    titleSearch.value.trim() === "" &&
    typeFilter.value === "all" &&
    categoryFilter.value === "" &&
    dateFilter.value === "all";

  if (transactions.length === 0 && filtersAreClear) {
    emptyState.textContent = "Your transactions will appear here after you add one.";
  } else if (visibleTransactions.length === 0) {
    emptyState.textContent = "No transactions match the current filters. Adjust the filters to see transactions.";
  }

  const fragment = document.createDocumentFragment();
  for (const transaction of sortedTransactions) {
    const row = document.createElement("tr");
    addCell(row, transaction.title);
    addCell(row, transaction.category);
    addCell(row, transaction.date);
    addCell(row, String(transaction.amount));

    const typeCell = document.createElement("td");
    const typeLabel = document.createElement("span");
    typeLabel.className = "type-label";
    typeLabel.dataset.type = transaction.type;
    typeLabel.textContent = transaction.type === "income" ? "Income" : "Expense";
    typeCell.append(typeLabel);
    row.append(typeCell);

    const actionsCell = document.createElement("td");
    actionsCell.className = "actions-cell";
    const actions = document.createElement("div");
    actions.className = "row-actions";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "row-action-button";
    editButton.textContent = "Edit";
    editButton.setAttribute("aria-label", `Edit ${transaction.title}`);
    editButton.disabled = editingTransactionId !== null || pendingDeleteId !== null;
    editButton.dataset.action = "edit";
    editButton.dataset.transactionId = transaction.transaction_id;
    editButton.addEventListener("click", () => startEditing(transaction.transaction_id));
    actions.append(editButton);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "row-action-button row-action-button--danger";
    deleteButton.textContent = "Delete";
    deleteButton.setAttribute("aria-label", `Delete ${transaction.title}`);
    deleteButton.disabled = editingTransactionId !== null || pendingDeleteId !== null;
    deleteButton.dataset.action = "delete";
    deleteButton.dataset.transactionId = transaction.transaction_id;
    deleteButton.addEventListener("click", () => requestDelete(transaction.transaction_id));
    actions.append(deleteButton);

    actionsCell.append(actions);
    row.append(actionsCell);

    fragment.append(row);
  }

  transactionRows.append(fragment);
  renderDashboard(visibleTransactions);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  formMessage.textContent = "";

  const transactionResult = readTransaction(form, editingTransactionId);
  if (transactionResult.error) {
    formMessage.textContent = transactionResult.error;
    return;
  }

  if (editingTransactionId !== null) {
    const transactionIndex = transactions.findIndex(
      (transaction) => transaction.transaction_id === editingTransactionId,
    );

    if (transactionIndex === -1) {
      formMessage.textContent = "This transaction could not be found. Cancel and choose it again.";
      return;
    }

    transactions[transactionIndex] = transactionResult.transaction;
  } else {
    transactions.push(transactionResult.transaction);
  }

  saveTransactions();
  pendingDeleteId = null;
  setFormMode();
});

cancelEditButton.addEventListener("click", () => setFormMode());
cancelDeleteButton.addEventListener("click", cancelDelete);
confirmDeleteButton.addEventListener("click", confirmDelete);
dateSortButton.addEventListener("click", () => toggleSort("date"));
amountSortButton.addEventListener("click", () => toggleSort("amount"));
typeFilter.addEventListener("change", renderTransactions);
categoryFilter.addEventListener("change", renderTransactions);
titleSearch.addEventListener("input", renderTransactions);
dateFilter.addEventListener("change", renderTransactions);
monthFilter.addEventListener("change", renderTransactions);
deleteDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  cancelDelete();
});
deleteDialog.addEventListener("click", (event) => {
  if (event.target === deleteDialog) {
    cancelDelete();
  }
});

form.addEventListener("input", () => {
  formMessage.textContent = "";
});

form.addEventListener("change", () => {
  formMessage.textContent = "";
});

if (initialTransactionLoad.error) {
  storageMessage.textContent =
    initialTransactionLoad.error === "storage-unavailable"
      ? "Local Storage could not be accessed. Transactions may not survive a page refresh."
      : "Saved transactions could not be read. The stored value was left untouched; adding a transaction will replace it with a new list.";
  storageMessage.hidden = false;
}

renderTransactions();
