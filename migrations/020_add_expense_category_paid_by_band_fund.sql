-- What an Expense was for, shown as a per-category summary. Existing rows are 'other'.
ALTER TABLE event_expenses
  ADD COLUMN category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('transport', 'sound', 'rentals', 'food', 'other'));

-- Share of the Event's net kept for the band before the split, in basis
-- points (hundredths of a percent, 10 000 = 100%).
ALTER TABLE events
  ADD COLUMN band_fund_basis_points INTEGER NOT NULL DEFAULT 0
    CHECK (band_fund_basis_points BETWEEN 0 AND 5000);
