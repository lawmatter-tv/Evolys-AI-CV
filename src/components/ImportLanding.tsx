import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  FileText,
  FileUp,
  Loader2,
  Sparkles,
  Target,
  Upload,
} from 'lucide-react';
import { AppLanguage, SavedCvHistoryItem } from '../types';
import { SAMPLE_CVS } from '../data/sampleCv';

interface ImportLandingProps {
  language: AppLanguage;
  targetRole: string;
  onTargetRoleChange: (val: string) => void;
  isAnalyzing: boolean;
  error: string | null;
  onAnalyzeFile: (file: File) => void;
  onAnalyzeText: (text: string, fileName: string) => void;
  history: SavedCvHistoryItem[];
  onSelectHistory: (item: SavedCvHistoryItem) => void;
}

export const ImportLanding: React.FC<ImportLandingProps> = ({
  language,
  targetRole,
  onTargetRoleChange,
  isAnalyzing,
  error,
  onAnalyzeFile,
  onAnalyzeText,
  history,
  onSelectHistory,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [inputMode, setInputMode] = useState<'file' | 'paste'>('file');
  const [pastedText, setPastedText] = useState('');
  const [pastedTitle, setPastedTitle] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(0);

  const isEn = language === 'en';

  useEffect(() => {
    if (!isAnalyzing) {
      setAnalysisStep(0);
      return;
    }
    setAnalysisStep(1);
    const t1 = setTimeout(() => setAnalysisStep(2), 1800);
    const t2 = setTimeout(() => setAnalysisStep(3), 4000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isAnalyzing]);

  const analysisSteps = isEn
    ? [
        'Extracting readable text and sections...',
        'Running 10 ATS formatting & structure checks...',
        'Auditing content impact without inventing facts...',
      ]
    : [
        'Extraction fidèle du texte et des sections...',
        'Audit technique ATS sur 10 critères de structure...',
        'Analyse rédactionnelle et pistes sans rien inventer...',
      ];

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    onAnalyzeFile(files[0]);
  };

  const handlePasteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pastedText.trim()) return;
    const title = pastedTitle.trim() || 'CV_Saisie_Manuelle.txt';
    onAnalyzeText(pastedText.trim(), title);
  };

  const capabilities = isEn
    ? [
        'ATS Format Score & 10 technical checks',
        'Line-by-line AI rewrites (nothing fabricated)',
        'One-click CV recreation & vector ATS PDF',
        'Job offer keyword match, 5 Giants & Cover letter',
      ]
    : [
        'Score ATS & 10 vérifications de lisibilité',
        'Retour IA ligne par ligne (rien d’inventé)',
        'Recréation complète du CV + export PDF ATS',
        'Comparaison d’offres, 5 géants, lettre & entretien',
      ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12 space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Primary Action Column */}
        <section className="lg:col-span-7 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6 sm:p-8 space-y-6">
          <div className="space-y-2.5">
            <p className="text-xs font-semibold tracking-wider text-[var(--accent-text)] uppercase">
              {isEn
                ? 'EVOLYS · Training · Employability · Digital Solutions'
                : 'EVOLYS · Formation · Employabilité · Solutions Numériques'}
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[var(--text-primary)] text-balance leading-[1.14]">
              {isEn
                ? 'See your CV through the eyes of an ATS'
                : 'Voyez votre CV avec les yeux d’un ATS'}
            </h1>
            <p className="text-base text-[var(--text-secondary)] max-w-2xl leading-relaxed">
              {isEn
                ? 'Inspect how recruiter software reads your CV, fix weak phrasing without fabricating facts, and recreate a clean ATS-ready PDF.'
                : 'Découvrez comment les logiciels de recrutement lisent votre CV, corrigez-le sans rien inventer et recréez un PDF propre prêt pour l’ATS.'}
            </p>
          </div>

          {/* Target Role */}
          <div>
            <label
              htmlFor="target-role-input"
              className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5"
            >
              {isEn
                ? 'Target job title (optional)'
                : 'Poste visé (optionnel — affine les mots-clés et la recréation)'}
            </label>
            <div className="relative">
              <Target className="w-4 h-4 text-[var(--text-secondary)] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="target-role-input"
                type="text"
                value={targetRole}
                onChange={(e) => onTargetRoleChange(e.target.value)}
                placeholder={
                  isEn
                    ? 'e.g., Digital Project Manager, Nurse, Accountant...'
                    : 'Ex : Chef de projet numérique, Infirmière auxiliaire, Comptable...'
                }
                className="w-full min-h-[44px] pl-10 pr-4 py-2.5 text-sm bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)]"
              />
            </div>
          </div>

          {/* Segmented Input Mode */}
          <div className="flex items-center gap-1 p-1 bg-[var(--bg-elevated)] rounded-xl w-fit">
            <button
              type="button"
              onClick={() => setInputMode('file')}
              className={`min-h-[38px] px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                inputMode === 'file'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {isEn ? 'Import File' : 'Importer un fichier'}
            </button>
            <button
              type="button"
              onClick={() => setInputMode('paste')}
              className={`min-h-[38px] px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                inputMode === 'paste'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {isEn ? 'Paste Text' : 'Coller le texte'}
            </button>
          </div>

          {inputMode === 'file' ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                handleFiles(e.dataTransfer.files);
              }}
              className={`border-2 border-dashed rounded-2xl p-7 text-center transition-colors ${
                isDragging
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                  : 'border-[var(--border-strong)] bg-[var(--bg-grouped)] hover:border-[var(--accent)]'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.doc,.txt,.png,.jpg,.jpeg"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <div className="w-12 h-12 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-text)] flex items-center justify-center mx-auto">
                {isAnalyzing ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <FileUp className="w-6 h-6" />
                )}
              </div>

              {isAnalyzing ? (
                <div className="mt-4 max-w-sm mx-auto space-y-2.5">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {analysisSteps[Math.max(0, analysisStep - 1)]}
                  </p>
                  <div className="h-1.5 w-full bg-[var(--bg-elevated)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--accent)] transition-all duration-500 rounded-full"
                      style={{ width: `${Math.min(92, analysisStep * 32)}%` }}
                    />
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] font-mono-tabular">
                    {isEn ? `Step ${analysisStep}/3` : `Étape ${analysisStep}/3`}
                  </p>
                </div>
              ) : (
                <>
                  <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                    {isEn
                      ? 'Drop your CV here or choose a file'
                      : 'Déposez votre CV ici ou sélectionnez un fichier'}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    {isEn
                      ? 'PDF, DOCX, DOC, TXT or clear image · ATS score in seconds'
                      : 'PDF, DOCX, DOC, TXT ou image · Score ATS en quelques secondes'}
                  </p>
                  <button
                    type="button"
                    disabled={isAnalyzing}
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-5 min-h-[44px] inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    {isEn ? 'Import CV' : 'Importer votre CV'}
                  </button>
                </>
              )}
            </div>
          ) : (
            <form onSubmit={handlePasteSubmit} className="space-y-3">
              <input
                type="text"
                value={pastedTitle}
                onChange={(e) => setPastedTitle(e.target.value)}
                placeholder={
                  isEn ? 'Candidate or file label (optional)' : 'Nom du candidat ou libellé (optionnel)'
                }
                className="w-full min-h-[44px] px-3.5 py-2 text-sm bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
              />
              <textarea
                rows={7}
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder={
                  isEn
                    ? 'Paste the full CV text here...'
                    : 'Collez ici le texte intégral du CV à analyser et recréer...'
                }
                className="w-full p-3.5 text-sm bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-y"
              />
              <div className="flex items-center justify-between gap-4">
                <button
                  type="submit"
                  disabled={isAnalyzing || !pastedText.trim()}
                  className="min-h-[44px] inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {isAnalyzing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  {isAnalyzing
                    ? analysisSteps[Math.max(0, analysisStep - 1)]
                    : isEn
                      ? 'Analyze CV'
                      : 'Analyser ce CV'}
                </button>
              </div>
            </form>
          )}

          {error && (
            <div
              role="alert"
              className="p-4 rounded-xl text-sm border"
              style={{
                backgroundColor: 'var(--status-err-bg)',
                color: 'var(--status-err)',
                borderColor: 'var(--status-err)',
              }}
            >
              {error}
            </div>
          )}

          {/* Quick-Test Samples */}
          <div className="pt-4 border-t border-[var(--border-hairline)]">
            <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2.5">
              {isEn ? 'Test with a sample CV:' : 'Tester avec un CV exemple :'}
            </p>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_CVS.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  disabled={isAnalyzing}
                  onClick={() => {
                    onTargetRoleChange(sample.targetRole);
                    onAnalyzeText(sample.text, sample.fileName);
                  }}
                  className="min-h-[40px] inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] bg-[var(--bg-grouped)] hover:bg-[var(--bg-elevated)] border border-[var(--border-hairline)] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <FileText className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                  {sample.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Secondary Column: How it works & Recent Sessions */}
        <aside className="lg:col-span-5 space-y-6">
          <section className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6">
            <h2 className="text-base font-bold text-[var(--text-primary)]">
              {isEn ? 'How it works' : 'Comment ça marche'}
            </h2>
            <ol className="mt-4 divide-y divide-[var(--border-hairline)]">
              {[
                {
                  step: '1',
                  title: isEn ? 'Import your CV (PDF, DOCX or DOC)' : 'Importez votre CV (PDF, DOCX ou DOC)',
                  detail: isEn
                    ? 'Upload any file or paste text directly.'
                    : 'Importez un fichier ou collez le texte brut.',
                },
                {
                  step: '2',
                  title: isEn ? 'Get Format & Content ATS scores' : 'Obtenez le double score Format & Contenu',
                  detail: isEn
                    ? '10 technical checks plus writing impact diagnostics.'
                    : '10 critères ATS techniques et analyse rédactionnelle.',
                },
                {
                  step: '3',
                  title: isEn
                    ? 'Fix, recreate PDF, match offers & prep'
                    : 'Corrigez, recréez en PDF et préparez l’entretien',
                  detail: isEn
                    ? 'Everything stays strictly faithful to your real background.'
                    : 'Rien n’est inventé : 100 % fidèle au parcours réel.',
                },
              ].map((item) => (
                <li key={item.step} className="py-3.5 first:pt-0 last:pb-0 flex items-start gap-3.5">
                  <span className="w-7 h-7 rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)] font-mono-tabular text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {item.step}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{item.title}</p>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">{item.detail}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-5 pt-4 border-t border-[var(--border-hairline)] space-y-2">
              {capabilities.map((cap) => (
                <div key={cap} className="flex items-center gap-2.5 text-xs text-[var(--text-secondary)]">
                  <CheckCircle2 className="w-4 h-4 text-[var(--accent-text)] shrink-0" />
                  <span>{cap}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Saved Sessions */}
          {history.length > 0 && (
            <section className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold text-[var(--text-primary)]">
                  {isEn ? 'Recent CV Sessions' : 'CV récents'}
                </h2>
                <span className="text-xs font-mono-tabular text-[var(--text-secondary)]">
                  {history.length}
                </span>
              </div>
              <div className="divide-y divide-[var(--border-hairline)]">
                {history.slice(0, 4).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectHistory(item)}
                    className="w-full min-h-[52px] py-3 flex items-center justify-between gap-3 text-left hover:opacity-80 transition-opacity cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                        {item.candidateName}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)] font-mono-tabular mt-0.5">
                        Format {item.formatScore} · Contenu {item.contentScore}
                        {item.recreated ? (isEn ? ' · Recreated' : ' · Recréé') : ''}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                  </button>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
};
