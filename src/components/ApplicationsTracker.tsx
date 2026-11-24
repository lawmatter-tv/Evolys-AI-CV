import React, { useState } from 'react';
import { Briefcase, Plus, Search, Trash2 } from 'lucide-react';
import { ApplicationStatus, AppLanguage, CandidateApplication } from '../types';

interface ApplicationsTrackerProps {
  applications: CandidateApplication[];
  onAddApplication: (app: Omit<CandidateApplication, 'id'>) => void;
  onUpdateStatus: (id: string, status: ApplicationStatus) => void;
  onDeleteApplication: (id: string) => void;
  defaultCandidateName?: string;
  defaultJobTitle?: string;
  defaultAtsScore?: number;
  language: AppLanguage;
}

export const ApplicationsTracker: React.FC<ApplicationsTrackerProps> = ({
  applications,
  onAddApplication,
  onUpdateStatus,
  onDeleteApplication,
  defaultCandidateName = '',
  defaultJobTitle = '',
  defaultAtsScore = 0,
  language,
}) => {
  const isEn = language === 'en';
  const [filterStatus, setFilterStatus] = useState<'all' | ApplicationStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  const [candidateName, setCandidateName] = useState(defaultCandidateName);
  const [company, setCompany] = useState('');
  const [jobTitle, setJobTitle] = useState(defaultJobTitle);
  const [notes, setNotes] = useState('');

  const statusLabels: Record<ApplicationStatus, string> = isEn
    ? {
        a_envoyer: 'To Send',
        envoye: 'Sent',
        entretien: 'Interview',
        offre: 'Offer',
        refus: 'Declined',
      }
    : {
        a_envoyer: 'À envoyer',
        envoye: 'Envoyé',
        entretien: 'Entretien',
        offre: 'Offre',
        refus: 'Refus',
      };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!company.trim() || !jobTitle.trim()) return;
    onAddApplication({
      candidateName: candidateName.trim() || (isEn ? 'Candidate' : 'Candidat'),
      company: company.trim(),
      jobTitle: jobTitle.trim(),
      status: 'a_envoyer',
      appliedDate: new Date().toISOString().slice(0, 10),
      atsScoreSnapshot: defaultAtsScore,
      notes: notes.trim(),
    });
    setCompany('');
    setNotes('');
    setShowAddForm(false);
  };

  const filtered = applications.filter((item) => {
    const matchesStatus = filterStatus === 'all' || item.status === filterStatus;
    const q = searchQuery.toLowerCase().trim();
    const matchesQuery =
      !q ||
      item.company.toLowerCase().includes(q) ||
      item.jobTitle.toLowerCase().includes(q) ||
      item.candidateName.toLowerCase().includes(q);
    return matchesStatus && matchesQuery;
  });

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">
            {isEn ? 'Applications Tracker' : 'Suivi des candidatures'}
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            {isEn
              ? 'Follow every sent CV, cover letter, and interview outcome in one place.'
              : 'Suivez chaque candidature avec le CV et la lettre envoyés.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          {isEn ? 'Add Application' : 'Ajouter une candidature'}
        </button>
      </div>

      {showAddForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6 space-y-4"
        >
          <h2 className="text-sm font-bold text-[var(--text-primary)]">
            {isEn ? 'Log Application' : 'Nouvelle candidature'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              value={candidateName}
              onChange={(e) => setCandidateName(e.target.value)}
              placeholder={isEn ? 'Candidate name' : 'Nom du candidat'}
              className="min-h-[44px] px-3.5 py-2 text-sm bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl"
            />
            <input
              type="text"
              required
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder={isEn ? 'Company *' : 'Entreprise *'}
              className="min-h-[44px] px-3.5 py-2 text-sm bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl"
            />
            <input
              type="text"
              required
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder={isEn ? 'Job title *' : 'Poste visé *'}
              className="min-h-[44px] px-3.5 py-2 text-sm bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl"
            />
          </div>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              isEn
                ? 'Notes (contact, link, CV version...)'
                : 'Notes (contact, lien, version du CV...)'
            }
            className="w-full min-h-[44px] px-3.5 py-2 text-sm bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl"
          />
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="min-h-[40px] px-5 py-2 text-xs font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-xl cursor-pointer"
            >
              {isEn ? 'Save Application' : 'Enregistrer'}
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="min-h-[40px] px-4 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              {isEn ? 'Cancel' : 'Annuler'}
            </button>
          </div>
        </form>
      )}

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[var(--bg-elevated)] rounded-xl w-fit">
          {(['all', 'a_envoyer', 'envoye', 'entretien', 'offre', 'refus'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setFilterStatus(st)}
              className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filterStatus === st
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {st === 'all' ? (isEn ? 'All' : 'Toutes') : statusLabels[st]}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-[var(--text-secondary)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isEn ? 'Search company or candidate...' : 'Rechercher entreprise, poste...'}
            className="w-full min-h-[44px] pl-9 pr-3.5 py-2 text-xs bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl"
          />
        </div>
      </div>

      {/* Table / Empty State */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 px-6 text-center space-y-3">
            <Briefcase className="w-8 h-8 text-[var(--accent-text)] mx-auto opacity-80" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {isEn ? 'No applications tracked yet' : 'Aucune candidature enregistrée'}
            </p>
            <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
              {isEn
                ? 'Log your first application or save directly from the Cover Letter generator.'
                : 'Ajoutez votre première candidature ici ou enregistrez directement depuis la lettre de motivation.'}
            </p>
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="min-h-[44px] inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-xl cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              {isEn ? 'Add Application' : 'Ajouter une candidature'}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] bg-[var(--bg-grouped)] text-xs font-semibold text-[var(--text-secondary)]">
                  <th className="py-3 px-4">{isEn ? 'Candidate' : 'Candidat'}</th>
                  <th className="py-3 px-4">{isEn ? 'Company' : 'Entreprise'}</th>
                  <th className="py-3 px-4">{isEn ? 'Position' : 'Poste'}</th>
                  <th className="py-3 px-4">{isEn ? 'Date' : 'Date'}</th>
                  <th className="py-3 px-4 text-right">ATS</th>
                  <th className="py-3 px-4">{isEn ? 'Status' : 'Statut'}</th>
                  <th className="py-3 px-4 text-right">{isEn ? 'Action' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)] text-xs">
                {filtered.map((app) => (
                  <tr key={app.id} className="hover:bg-[var(--bg-grouped)]">
                    <td className="py-3.5 px-4 font-medium text-[var(--text-primary)]">
                      {app.candidateName}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-[var(--text-primary)]">
                      {app.company}
                    </td>
                    <td className="py-3.5 px-4 text-[var(--text-secondary)]">
                      <p className="text-[var(--text-primary)]">{app.jobTitle}</p>
                      {app.notes && (
                        <p className="text-xs text-[var(--text-secondary)] truncate max-w-xs">
                          {app.notes}
                        </p>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono-tabular text-[var(--text-secondary)]">
                      {app.appliedDate}
                    </td>
                    <td className="py-3.5 px-4 font-mono-tabular text-right font-semibold text-[var(--accent-text)]">
                      {app.atsScoreSnapshot > 0 ? `${app.atsScoreSnapshot}` : '—'}
                    </td>
                    <td className="py-3.5 px-4">
                      <select
                        value={app.status}
                        onChange={(e) =>
                          onUpdateStatus(app.id, e.target.value as ApplicationStatus)
                        }
                        className="min-h-[36px] px-2.5 py-1 text-xs font-medium bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-lg"
                      >
                        {Object.entries(statusLabels).map(([val, label]) => (
                          <option key={val} value={val}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => onDeleteApplication(app.id)}
                        aria-label="Supprimer"
                        className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--status-err)] cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
