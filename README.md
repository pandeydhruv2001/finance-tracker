# Personal Finance Tracker

A personal finance tracker built with HTML, CSS, and vanilla JavaScript. It records income and expenses, shows totals, and lets you search, filter, sort, edit, and delete transactions.

## Features

- Add transactions with a title, amount, category, date, and type.
- Validate required fields, positive finite amounts, and dates.
- View balance, income, and expense totals calculated from the transaction list.
- Edit transactions and confirm before deleting them.
- Search titles using case-insensitive partial text.
- Filter by type, category, and date. Date choices include this month, last month, or a selected month and year.
- Sort by latest date, oldest date, highest amount, or lowest amount.
- Keep transaction data through refresh with browser Local Storage.
- Use the responsive layout and navigation links to reach the dashboard, form, and transaction list.

## Run locally

Open `index.html` in a modern web browser. The app has no build step or package installation.

## Data storage

Transactions are stored in Local Storage under `finance-tracker-transactions`. The data belongs to the current browser profile and site origin; it does not automatically sync to another browser or device.

## Project files

```text
Finance-Tracker/
├── index.html
├── css/
│   └── style.css
├── js/
│   └── app.js
└── assets/
```
