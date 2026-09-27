"use client";

import {
  VanatomeViewer,
  type VanatomeAtlas,
  type VanatomeContextMenuEvent,
  type VanatomeIsolationState,
} from "@vixotic/vanatome-react";
import { SYSTEM_COLORS } from "../data/anatomy";

type Props = {
  atlases: readonly VanatomeAtlas[];
  selectedId: string | null;
  isolation: VanatomeIsolationState | null;
  visibleLayers: readonly string[];
  focusRequestKey: number;
  resetViewKey: number;
  onSelect: (id: string | null) => void;
  onStructureContextMenu: (event: VanatomeContextMenuEvent) => void;
  onEscape: () => void;
  interactive?: boolean;
  focusOnSelection?: boolean;
  hiddenIds?: readonly string[];
};

export function AnatomyScene({
  atlases,
  interactive = true,
  focusOnSelection = true,
  ...props
}: Props) {
  return (
    <VanatomeViewer
      atlases={atlases}
      modelScale={7}
      modelPosition={[0, -6.1, 0]}
      initialCameraPosition={[0, 0, 18]}
      focusOnSelection={focusOnSelection}
      focusDistance={2.2}
      systemColors={SYSTEM_COLORS}
      appearance={{ bodyShellOpacity: interactive ? 0.12 : 0.07 }}
      enablePan={interactive}
      style={{ pointerEvents: interactive ? "auto" : "none" }}
      alwaysVisibleIds={["body-shell"]}
      loadingFallback={(
        <div className="scene-loading">
          <div className="scanner-ring" />
          <span>Loading anatomical geometry</span>
        </div>
      )}
      incrementalLoadingFallback={(
        <div className="bundle-switching">
          <div className="scanner-ring" />
          <span>STREAMING SELECTED ANATOMY</span>
        </div>
      )}
      {...props}
    />
  );
}
