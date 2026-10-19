'use client';

import { FolderOpen, Gamepad2, Layers3, Settings2 } from 'lucide-react';
import { Button, Panel } from '../ui/primitives';
import { openNewGame } from './NewGameModal';
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
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent/5 p-4">
          <div>
            <h2 className="text-sm font-semibold">Partie libre</h2>
            <p className="text-xs text-muted">Choisissez vos horaires (jusqu&apos;à une journée de 24 h, par exemple 7 h → 7 h), les lignes dont vous vous occupez et la fréquence des incidents imprévus.</p>
          </div>
          <Button variant="primary" size="md" onClick={openNewGame}>
            <Gamepad2 size={15} /> Nouvelle partie
          </Button>
        </div>
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
