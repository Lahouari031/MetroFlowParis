'use client';

import { MetroMap } from '../map/MetroMap';
import { IncidentFormModal } from '../simulation/IncidentForm';
import { LeftSidebar } from './LeftSidebar';
import { RightSidebar } from './RightSidebar';

/** Tableau de bord en trois zones : commandes | plan | indicateurs. */
export function MapDashboard() {
  return (
    <div className="flex h-full min-h-0">
      <LeftSidebar />
      <div className="relative min-w-0 flex-1">
        <MetroMap />
      </div>
      <RightSidebar />
      <IncidentFormModal />
    </div>
  );
}
