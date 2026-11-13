import { buildWagerGrowthSchedule, type WagerGrowthTick } from "../../../shared/wager-growth-schedule";
import { money } from "../../lib/format";
import type { Board, Player } from "../../lib/types";
import { AdminModal, ModalCloseButton, ModalCloseX } from "../AdminModal";

export interface GrowthSchedule {
  title: string;
  subtitle: string;
  items: WagerGrowthTick[];
}

/**
 * 72h preview for one player (legacy `openScheduleModal`), computed once when the
 * modal opens with the same shared function the server cron uses.
 */
export function buildPlayerSchedule(player: Player, board: Board): GrowthSchedule {
  const interval =
    (player.wag_growth_hours ? player.wag_growth_hours * 3600000 : board.auto_wager_growth_interval_ms) || 43200000;
  const pct = player.wag_growth_pct || board.auto_wager_growth_pct || 3;

  const items = buildWagerGrowthSchedule({
    playerId: player.id,
    boardId: board.id,
    startWageredCents: player.wagered_cents,
    anchorMs: Date.now(),
    intervalMs: interval,
    targetPct: pct,
  });

  return {
    title: `Growth plan (72h) · ${player.username}`,
    subtitle: `Current wager: ${money(player.wagered_cents)}`,
    items,
  };
}

interface GrowthScheduleModalProps {
  open: boolean;
  schedule: GrowthSchedule | undefined;
  onClose: () => void;
}

/** "72-hour growth plan" modal (`#modal-growth-schedule`). */
export function GrowthScheduleModal({ open, schedule, onClose }: GrowthScheduleModalProps) {
  return (
    <AdminModal id="modal-growth-schedule" open={open}>
      <div className="admin-modal__head">
        <div>
          <h3 data-wager-schedule-title="">{schedule ? schedule.title : "72-hour growth plan"}</h3>
          <p data-wager-schedule-subtitle="">{schedule?.subtitle}</p>
        </div>
        <ModalCloseX onClose={onClose} />
      </div>
      <div className="admin-modal__body">
        <ul className="growth-timeline" data-wager-schedule-list="">
          {schedule ? (
            schedule.items.length ? (
              schedule.items.map((it, i) => (
                <li key={i} className="growth-timeline__item">
                  <span>
                    Tick #{i + 1} ({new Date(it.at_ms).toLocaleString("en-US")})
                  </span>{" "}
                  <strong>
                    +{it.pct}% → {money(it.wagered_cents)}
                  </strong>
                </li>
              ))
            ) : (
              <li className="growth-timeline__item">Auto-growth is disabled or no interval is set.</li>
            )
          ) : null}
        </ul>
      </div>
      <div className="admin-modal__footer">
        <ModalCloseButton onClose={onClose} label="Close" />
      </div>
    </AdminModal>
  );
}
