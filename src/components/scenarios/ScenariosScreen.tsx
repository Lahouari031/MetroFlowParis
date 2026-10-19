'use client';

import { FolderOpen, Layers3, Settings2 } from 'lucide-react';
import { Panel } from '../ui/primitives';
import { AdvancedLauncher, ExportPanel, SavedScenarios, ScenarioSelector } from './ScenarioSelector';

export function ScenariosScreen() {
  return (
    <div className="panel-scroll h-full">
      <div className="mx-auto max-w-7xl space-y-4 p-4">
        <header>
          <h1 className="text-lg font-semibold">Scénarios</h1>
          <p className="text-xs text-muted">
            Chaque scénario charge une heure de départ, une graine, un volume de demande, des incidents programmés et des objectifs mesurables. Le résultat final s&apos;affiche à la fin du temps imparti.
          </p>
        </header>
        <Panel title="Scénarios prédéfinis" icon={<Layers3 size={12} />}>
          <ScenarioSelector />
        </Panel>
        <Panel title="Paramètres avancés (simulation reproductible)" icon={<Settings2 size={12} />}>
          <AdvancedLauncher />
        </Panel>
        <Panel title="Sauvegardes" icon={<FolderOpen size={12} />}>
          <SavedScenarios />
        </Panel>
        <ExportPanel />
      </div>
    </div>
  );
}
