-- 0004 — Remove "Block" from plot identity.
-- Plots are now identified by plot_no alone (within a project); the block field
-- is no longer collected in the UI. We keep the column (nullable) so historical
-- rows are preserved, but drop the NOT NULL constraint and the composite unique
-- that included block.

alter table plots alter column block drop not null;

-- The old identity was unique (project_id, block, plot_no). Now plot_no alone
-- must be unique per project.
alter table plots drop constraint if exists plots_project_id_block_plot_no_key;

-- Enforce plot_no uniqueness per project. If this fails, you have legacy plots
-- that shared a plot_no across different blocks — dedupe them first, then re-run.
alter table plots add constraint plots_project_id_plot_no_key unique (project_id, plot_no);
