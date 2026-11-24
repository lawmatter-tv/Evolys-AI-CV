import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileCheck2,
  Loader2,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  AppLanguage,
  CvAnalysisResult,
  RecreatedCvResult,
  StructuredCvData,
} from '../types';
import { recreateCvRequest } from '../utils/api';
import { CvTemplateStyle, exportCvToPdf } from '../utils/pdfExport';

interface CvRecreatorStudioProps {
  analysis: CvAnalysisResult;
  recreatedResult: RecreatedCvResult | null;
  onRecreatedSaved: (res: RecreatedCvResult) => void;
  targetRole: string;
  language: AppLanguage;
  initialTab?: 'line-feedback' | 'recreate';
  onBackToAnalysis: () => void;
}

type EditorSectionKey = 'identity' | 'summary' | 'experiences' | 'education' | 'skills';

export const CvRecreatorStudio: React.FC<CvRecreatorStudioProps> = ({
  analysis,
  recreatedResult,
  onRecreatedSaved,
  targetRole,
  language,
  initialTab = 'recreate',
  onBackToAnalysis,
}) => {
  const isEn = language === 'en';
  const [activeTab, setActiveTab] = useState<'line-feedback' | 'recreate'>(initialTab);
  const [acceptedIds, setAcceptedIds] = useState<string[]>(() =>
    analysis.lineByLineFeedback.map((f) => f.id)
  );
  const [templateStyle, setTemplateStyle] = useState<CvTemplateStyle>('evolys-modern');
  const [customInstructions, setCustomInstructions] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [genStep, setGenStep] = useState(0);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [openSection, setOpenSection] = useState<EditorSectionKey>('experiences');
  const [editableCv, setEditableCv] = useState<StructuredCvData>(
    recreatedResult?.cv || analysis.structuredCv
  );

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (recreatedResult?.cv) {
      setEditableCv(recreatedResult.cv);
    } else {
      setEditableCv(analysis.structuredCv);
    }
  }, [recreatedResult, analysis]);

  useEffect(() => {
    if (!isGenerating) {
      setGenStep(0);
      return;
    }
    setGenStep(1);
    const t1 = setTimeout(() => setGenStep(2), 1600);
    const t2 = setTimeout(() => setGenStep(3), 3600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isGenerating]);

  const toggleFeedbackAccept = (id: string) => {
    setAcceptedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleRecreateCv = async () => {
    setIsGenerating(true);
    setError(null);
    setStatusNotice(null);
    try {
      const acceptedRewrites = analysis.lineByLineFeedback.filter((item) =>
        acceptedIds.includes(item.id)
      );
      const result = await recreateCvRequest({
        extractedText: analysis.extractedText,
        structuredCv: analysis.structuredCv,
        acceptedLineRewrites: acceptedRewrites,
        targetRole,
        tone: templateStyle,
        customInstructions,
        language,
      });
      setEditableCv(result.cv);
      onRecreatedSaved(result);
      setStatusNotice(
        isEn
          ? 'CV recreated cleanly from your real profile. Review or edit sections below.'
          : 'CV recréé avec succès à partir de votre parcours réel. Modifiez ou exportez en PDF.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la recréation du CV.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRevertToOriginal = () => {
    setEditableCv(analysis.structuredCv);
    setStatusNotice(
      isEn
        ? 'Reverted editor to original parsed CV content.'
        : 'Contenu rétabli à la version d’origine extraite du CV.'
    );
  };

  const updateCvField = <K extends keyof StructuredCvData>(
    key: K,
    value: StructuredCvData[K]
  ) => {
    setEditableCv((prev) => ({ ...prev, [key]: value }));
  };

  const updateExperience = (
    idx: number,
    patch: Partial<StructuredCvData['experiences'][number]>
  ) => {
    const next = [...editableCv.experiences];
    next[idx] = { ...next[idx], ...patch };
    updateCvField('experiences', next);
  };

  const addExperience = () => {
    updateCvField('experiences', [
      ...editableCv.experiences,
      {
        role: isEn ? 'Position Title' : 'Intitulé du poste',
        company: isEn ? 'Organization' : 'Entreprise / Organisation',
        period: '2024 - 2025',
        location: '',
        bullets: [
          isEn
            ? 'Key achievement with measurable outcome'
            : 'Réalisation clé avec résultat concret',
        ],
      },
    ]);
  };

  const removeExperience = (idx: number) => {
    updateCvField(
      'experiences',
      editableCv.experiences.filter((_, i) => i !== idx)
    );
  };

  const updateEducation = (
    idx: number,
    patch: Partial<StructuredCvData['education'][number]>
  ) => {
    const next = [...editableCv.education];
    next[idx] = { ...next[idx], ...patch };
    updateCvField('education', next);
  };

  const addEducation = () => {
    updateCvField('education', [
      ...editableCv.education,
      {
        degree: isEn ? 'Degree / Diploma' : 'Diplôme / Certification',
        school: isEn ? 'Institution' : 'Établissement',
        period: '2020 - 2023',
        details: '',
      },
    ]);
  };

  const removeEducation = (idx: number) => {
    updateCvField(
      'education',
      editableCv.education.filter((_, i) => i !== idx)
    );
  };

  const handleDownloadPdf = () => {
    exportCvToPdf(editableCv, templateStyle, language);
  };

  const accentHex =
    templateStyle === 'evolys-modern'
      ? '#0A4D30'
      : templateStyle === 'executive'
        ? '#182230'
        : '#141C18';

  const genLabels = isEn
    ? [
        'Structuring ATS headings...',
        'Strengthening action verbs without inventing facts...',
        'Composing final A4 layout...',
      ]
    : [
        'Structuration des rubriques ATS...',
        'Renforcement des verbes d’action sans rien inventer...',
        'Mise en page A4 finale...',
      ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Functional Workspace Toolbar */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-4 sm:px-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToAnalysis}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {isEn ? 'Audit' : 'Diagnostic'}
          </button>
          <div>
            <h1 className="text-lg font-bold text-[var(--text-primary)]">
              {isEn ? 'CV Correction & Recreation' : 'Correction & Recréation de CV'}
            </h1>
            <p className="text-xs text-[var(--text-secondary)]">
              {analysis.fileName} ·{' '}
              {isEn ? 'Nothing fabricated' : 'Rien d’inventé — 100 % fidèle'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-[var(--bg-elevated)] rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('line-feedback')}
              className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'line-feedback'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {isEn
                ? `Line-by-Line (${analysis.lineByLineFeedback.length})`
                : `Ligne par ligne (${analysis.lineByLineFeedback.length})`}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('recreate')}
              className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'recreate'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {isEn ? 'Recreate & PDF' : 'Recréer & PDF'}
            </button>
          </div>

          <button
            type="button"
            onClick={handleDownloadPdf}
            className="min-h-[40px] inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            {isEn ? 'Download PDF' : 'Télécharger le PDF'}
          </button>
        </div>
      </div>

      {activeTab === 'line-feedback' ? (
        <div className="space-y-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                {isEn
                  ? 'Line-by-Line AI Feedback (Nothing Fabricated)'
                  : 'Retour IA ligne par ligne (rien d’inventé)'}
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                {isEn
                  ? 'Select the rewrites to merge when recreating your CV.'
                  : 'Sélectionnez les reformulations à intégrer dans le CV recréé.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveTab('recreate');
                handleRecreateCv();
              }}
              className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {isEn
                ? `Recreate CV (${acceptedIds.length})`
                : `Recréer le CV (${acceptedIds.length} choix)`}
            </button>
          </div>

          <div className="space-y-4">
            {analysis.lineByLineFeedback.map((item) => {
              const isSelected = acceptedIds.includes(item.id);
              return (
                <div
                  key={item.id}
                  className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-5"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-[var(--border-hairline)]">
                    <div className="text-xs text-[var(--text-secondary)]">
                      <span className="font-semibold text-[var(--text-primary)]">{item.section}</span>
                      <span aria-hidden="true"> · </span>
                      <span>{item.issue}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleFeedbackAccept(item.id)}
                      className={`min-h-[36px] inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        isSelected
                          ? 'bg-[var(--accent-soft)] text-[var(--accent-text)]'
                          : 'bg-[var(--bg-grouped)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      {isSelected
                        ? isEn
                          ? 'Included'
                          : 'Sélectionné'
                        : isEn
                          ? 'Include'
                          : 'Inclure'}
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div
                      className="p-4 rounded-xl border border-[var(--border-hairline)]"
                      style={{ backgroundColor: 'var(--status-err-bg)' }}
                    >
                      <p
                        className="text-xs font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--status-err)' }}
                      >
                        {isEn ? 'Current CV Line' : 'Texte actuel'}
                      </p>
                      <p className="mt-1.5 text-sm text-[var(--text-primary)] leading-relaxed">
                        {item.originalLine}
                      </p>
                    </div>
                    <div
                      className="p-4 rounded-xl border border-[var(--border-hairline)]"
                      style={{ backgroundColor: 'var(--accent-soft)' }}
                    >
                      <p className="text-xs font-semibold text-[var(--accent-text)] uppercase tracking-wider">
                        {isEn ? 'Recommended Rewrite' : 'Reformulation recommandée'}
                      </p>
                      <p className="mt-1.5 text-sm font-medium text-[var(--text-primary)] leading-relaxed">
                        {item.improvedLine}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-[var(--text-secondary)]">{item.rationale}</p>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Recreation Controls */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-6 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
              <div className="lg:col-span-3">
                <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                  {isEn ? 'ATS Template' : 'Modèle ATS'}
                </label>
                <div className="grid grid-cols-3 gap-1 p-1 bg-[var(--bg-elevated)] rounded-xl">
                  {(
                    [
                      { id: 'evolys-modern', label: 'EVOLYS' },
                      { id: 'ats-classic', label: 'ATS Pur' },
                      { id: 'executive', label: 'Exécutif' },
                    ] as const
                  ).map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => setTemplateStyle(tpl.id)}
                      className={`min-h-[36px] py-1.5 px-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                        templateStyle === tpl.id
                          ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {tpl.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-5">
                <label
                  htmlFor="recreate-instructions"
                  className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5"
                >
                  {isEn
                    ? 'Custom guidance (optional)'
                    : 'Consigne pour la recréation (optionnel)'}
                </label>
                <input
                  id="recreate-instructions"
                  type="text"
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder={
                    isEn
                      ? 'e.g., Emphasize patient care & team coordination'
                      : 'Ex : Mettre en avant la gestion d’équipe et la rigueur'
                  }
                  className="w-full min-h-[44px] px-3.5 py-2 text-sm bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
                />
              </div>

              <div className="lg:col-span-4 flex flex-wrap sm:flex-nowrap gap-2 justify-end">
                <button
                  type="button"
                  onClick={handleRevertToOriginal}
                  title={isEn ? 'Revert to original CV' : 'Rétablir le CV d’origine'}
                  className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] bg-[var(--bg-grouped)] hover:bg-[var(--bg-elevated)] border border-[var(--border-hairline)] rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {isEn ? 'Revert' : 'Rétablir'}
                </button>
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={handleRecreateCv}
                  className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  {isGenerating
                    ? genLabels[Math.max(0, genStep - 1)]
                    : recreatedResult
                      ? isEn
                        ? 'Regenerate CV'
                        : 'Régénérer avec l’IA'
                      : isEn
                        ? 'Recreate CV with AI'
                        : 'Recréer mon CV avec l’IA'}
                </button>
              </div>
            </div>

            {statusNotice && (
              <div
                className="p-3 rounded-xl text-xs font-medium flex items-center gap-2"
                style={{ backgroundColor: 'var(--status-ok-bg)', color: 'var(--status-ok)' }}
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{statusNotice}</span>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="p-3 rounded-xl text-xs border"
                style={{
                  backgroundColor: 'var(--status-err-bg)',
                  color: 'var(--status-err)',
                  borderColor: 'var(--status-err)',
                }}
              >
                {error}
              </div>
            )}

            {recreatedResult && (
              <div className="pt-4 border-t border-[var(--border-hairline)] space-y-2">
                {recreatedResult.tailoredFor && (
                  <p className="text-xs font-semibold text-[var(--accent-text)]">
                    {isEn
                      ? `Tailored specifically for: ${recreatedResult.tailoredFor.jobTitle} (${recreatedResult.tailoredFor.company})${
                          recreatedResult.tailoredFor.matchScoreAfterTailoring
                            ? ` · Match ${recreatedResult.tailoredFor.matchScoreAfterTailoring}%`
                            : ''
                        }`
                      : `CV réadapté sur mesure pour : ${recreatedResult.tailoredFor.jobTitle} (${recreatedResult.tailoredFor.company})${
                          recreatedResult.tailoredFor.matchScoreAfterTailoring
                            ? ` · Adéquation ${recreatedResult.tailoredFor.matchScoreAfterTailoring}%`
                            : ''
                        }`}
                  </p>
                )}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="flex items-center gap-4 text-xs font-mono-tabular">
                    <span
                      className="inline-flex items-center gap-1.5 font-semibold"
                      style={{ color: 'var(--status-ok)' }}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Format {analysis.formatScore} → {recreatedResult.projectedFormatScore}/100
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="text-[var(--accent-text)] font-semibold">
                      Contenu {analysis.contentScore} → {recreatedResult.projectedContentScore}/100
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
                    {recreatedResult.improvementsSummary.slice(0, 3).map((summary, i) => (
                      <span key={i}>• {summary}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Split Workspace: Collapsible Inspector (Left) + Paper Mat A4 Sheet (Right) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Inspector */}
            <div className="lg:col-span-6 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl overflow-hidden divide-y divide-[var(--border-hairline)]">
              {/* Identity Accordion */}
              <div>
                <button
                  type="button"
                  onClick={() =>
                    setOpenSection(openSection === 'identity' ? 'experiences' : 'identity')
                  }
                  className="w-full min-h-[52px] px-6 py-3.5 flex items-center justify-between text-left cursor-pointer hover:bg-[var(--bg-grouped)]"
                >
                  <span className="text-sm font-bold text-[var(--text-primary)]">
                    {isEn ? '01. Contact & Headline' : '01. Identité & Coordonnées'}
                  </span>
                  {openSection === 'identity' ? (
                    <ChevronUp className="w-4 h-4 text-[var(--text-secondary)]" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[var(--text-secondary)]" />
                  )}
                </button>
                {openSection === 'identity' && (
                  <div className="px-6 pb-5 pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                        {isEn ? 'Full Name' : 'Nom complet'}
                      </label>
                      <input
                        type="text"
                        value={editableCv.fullName}
                        onChange={(e) => updateCvField('fullName', e.target.value)}
                        className="w-full min-h-[40px] px-3 py-2 text-sm bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                        {isEn ? 'Headline' : 'Titre professionnel'}
                      </label>
                      <input
                        type="text"
                        value={editableCv.headline}
                        onChange={(e) => updateCvField('headline', e.target.value)}
                        className="w-full min-h-[40px] px-3 py-2 text-sm bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                        E-mail
                      </label>
                      <input
                        type="text"
                        value={editableCv.email}
                        onChange={(e) => updateCvField('email', e.target.value)}
                        className="w-full min-h-[40px] px-3 py-2 text-sm bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                        {isEn ? 'Phone' : 'Téléphone'}
                      </label>
                      <input
                        type="text"
                        value={editableCv.phone}
                        onChange={(e) => updateCvField('phone', e.target.value)}
                        className="w-full min-h-[40px] px-3 py-2 text-sm bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                        {isEn ? 'Location' : 'Ville / Pays'}
                      </label>
                      <input
                        type="text"
                        value={editableCv.location}
                        onChange={(e) => updateCvField('location', e.target.value)}
                        className="w-full min-h-[40px] px-3 py-2 text-sm bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Summary Accordion */}
              <div>
                <button
                  type="button"
                  onClick={() =>
                    setOpenSection(openSection === 'summary' ? 'experiences' : 'summary')
                  }
                  className="w-full min-h-[52px] px-6 py-3.5 flex items-center justify-between text-left cursor-pointer hover:bg-[var(--bg-grouped)]"
                >
                  <span className="text-sm font-bold text-[var(--text-primary)]">
                    {isEn ? '02. Professional Summary' : '02. Profil professionnel'}
                  </span>
                  {openSection === 'summary' ? (
                    <ChevronUp className="w-4 h-4 text-[var(--text-secondary)]" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[var(--text-secondary)]" />
                  )}
                </button>
                {openSection === 'summary' && (
                  <div className="px-6 pb-5 pt-2">
                    <textarea
                      rows={4}
                      value={editableCv.summary}
                      onChange={(e) => updateCvField('summary', e.target.value)}
                      className="w-full p-3 text-sm bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl leading-relaxed"
                    />
                  </div>
                )}
              </div>

              {/* Experiences Accordion */}
              <div>
                <button
                  type="button"
                  onClick={() =>
                    setOpenSection(openSection === 'experiences' ? 'education' : 'experiences')
                  }
                  className="w-full min-h-[52px] px-6 py-3.5 flex items-center justify-between text-left cursor-pointer hover:bg-[var(--bg-grouped)]"
                >
                  <span className="text-sm font-bold text-[var(--text-primary)]">
                    {isEn
                      ? `03. Work Experience (${editableCv.experiences.length})`
                      : `03. Expériences (${editableCv.experiences.length})`}
                  </span>
                  {openSection === 'experiences' ? (
                    <ChevronUp className="w-4 h-4 text-[var(--text-secondary)]" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[var(--text-secondary)]" />
                  )}
                </button>
                {openSection === 'experiences' && (
                  <div className="px-6 pb-5 pt-2 space-y-3">
                    {editableCv.experiences.map((exp, idx) => (
                      <div
                        key={idx}
                        className="p-4 bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-2xl space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <input
                            type="text"
                            value={exp.role}
                            onChange={(e) => updateExperience(idx, { role: e.target.value })}
                            placeholder={isEn ? 'Job title' : 'Poste'}
                            className="flex-1 min-h-[38px] px-2.5 py-1.5 text-sm font-semibold bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-lg"
                          />
                          <button
                            type="button"
                            onClick={() => removeExperience(idx)}
                            aria-label="Supprimer cette expérience"
                            className="min-w-[36px] min-h-[36px] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--status-err)] cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={exp.company}
                            onChange={(e) => updateExperience(idx, { company: e.target.value })}
                            placeholder={isEn ? 'Company' : 'Entreprise'}
                            className="min-h-[36px] px-2.5 py-1.5 text-xs bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-lg"
                          />
                          <input
                            type="text"
                            value={exp.period}
                            onChange={(e) => updateExperience(idx, { period: e.target.value })}
                            placeholder="2022 - 2025"
                            className="min-h-[36px] px-2.5 py-1.5 text-xs bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-lg"
                          />
                        </div>
                        <textarea
                          rows={Math.max(2, exp.bullets.length)}
                          value={exp.bullets.join('\n')}
                          onChange={(e) =>
                            updateExperience(idx, {
                              bullets: e.target.value.split('\n'),
                            })
                          }
                          placeholder={
                            isEn ? 'One achievement per line...' : 'Une réalisation par ligne...'
                          }
                          className="w-full p-2.5 text-xs bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-lg leading-relaxed"
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addExperience}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[var(--accent-text)] hover:underline cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {isEn ? 'Add position' : 'Ajouter une expérience'}
                    </button>
                  </div>
                )}
              </div>

              {/* Education Accordion */}
              <div>
                <button
                  type="button"
                  onClick={() =>
                    setOpenSection(openSection === 'education' ? 'skills' : 'education')
                  }
                  className="w-full min-h-[52px] px-6 py-3.5 flex items-center justify-between text-left cursor-pointer hover:bg-[var(--bg-grouped)]"
                >
                  <span className="text-sm font-bold text-[var(--text-primary)]">
                    {isEn
                      ? `04. Education (${editableCv.education.length})`
                      : `04. Formations (${editableCv.education.length})`}
                  </span>
                  {openSection === 'education' ? (
                    <ChevronUp className="w-4 h-4 text-[var(--text-secondary)]" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[var(--text-secondary)]" />
                  )}
                </button>
                {openSection === 'education' && (
                  <div className="px-6 pb-5 pt-2 space-y-3">
                    {editableCv.education.map((edu, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-2xl space-y-2"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={edu.degree}
                            onChange={(e) => updateEducation(idx, { degree: e.target.value })}
                            placeholder={isEn ? 'Degree' : 'Diplôme'}
                            className="flex-1 min-h-[36px] px-2.5 py-1.5 text-xs font-semibold bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-lg"
                          />
                          <button
                            type="button"
                            onClick={() => removeEducation(idx)}
                            aria-label="Supprimer cette formation"
                            className="min-w-[34px] min-h-[34px] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--status-err)] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={edu.school}
                            onChange={(e) => updateEducation(idx, { school: e.target.value })}
                            placeholder={isEn ? 'Institution' : 'Établissement'}
                            className="min-h-[36px] px-2.5 py-1.5 text-xs bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-lg"
                          />
                          <input
                            type="text"
                            value={edu.period}
                            onChange={(e) => updateEducation(idx, { period: e.target.value })}
                            placeholder="2019 - 2021"
                            className="min-h-[36px] px-2.5 py-1.5 text-xs bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-lg"
                          />
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addEducation}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[var(--accent-text)] hover:underline cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {isEn ? 'Add degree' : 'Ajouter une formation'}
                    </button>
                  </div>
                )}
              </div>

              {/* Skills & Languages Accordion */}
              <div>
                <button
                  type="button"
                  onClick={() =>
                    setOpenSection(openSection === 'skills' ? 'identity' : 'skills')
                  }
                  className="w-full min-h-[52px] px-6 py-3.5 flex items-center justify-between text-left cursor-pointer hover:bg-[var(--bg-grouped)]"
                >
                  <span className="text-sm font-bold text-[var(--text-primary)]">
                    {isEn ? '05. Skills & Languages' : '05. Compétences & Langues'}
                  </span>
                  {openSection === 'skills' ? (
                    <ChevronUp className="w-4 h-4 text-[var(--text-secondary)]" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[var(--text-secondary)]" />
                  )}
                </button>
                {openSection === 'skills' && (
                  <div className="px-6 pb-5 pt-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                        {isEn ? 'Skills (comma separated)' : 'Compétences (virgules)'}
                      </label>
                      <textarea
                        rows={3}
                        value={editableCv.skills.join(', ')}
                        onChange={(e) =>
                          updateCvField(
                            'skills',
                            e.target.value
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean)
                          )
                        }
                        className="w-full p-2.5 text-xs bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                        {isEn ? 'Languages (comma separated)' : 'Langues (virgules)'}
                      </label>
                      <textarea
                        rows={3}
                        value={editableCv.languages.join(', ')}
                        onChange={(e) =>
                          updateCvField(
                            'languages',
                            e.target.value
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean)
                          )
                        }
                        className="w-full p-2.5 text-xs bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Tactile A4 Paper Mat Preview */}
            <div className="lg:col-span-6 bg-[var(--bg-paper-mat)] border border-[var(--border-hairline)] rounded-3xl p-4 sm:p-6 space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
                  <FileCheck2 className="w-4 h-4 text-[var(--accent-text)]" />
                  {isEn ? 'A4 ATS Print Sheet' : 'Feuille A4 prête pour l’ATS'}
                </span>
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-[var(--accent-text)] hover:underline cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  {isEn ? 'Export PDF' : 'Exporter PDF'}
                </button>
              </div>

              {/* Paper sheet remains crisp white ink-on-paper */}
              <div className="bg-white border border-[#D4DBD7] rounded-xl p-7 sm:p-9 shadow-sm text-[#141C18] space-y-5">
                {templateStyle === 'evolys-modern' && (
                  <div className="h-1.5 w-full rounded-full" style={{ backgroundColor: accentHex }} />
                )}

                <div>
                  <h2 className="text-2xl font-bold tracking-tight" style={{ color: accentHex }}>
                    {editableCv.fullName || 'Nom du Candidat'}
                  </h2>
                  {editableCv.headline && (
                    <p className="text-sm font-medium text-[#2A352F] mt-0.5">
                      {editableCv.headline}
                    </p>
                  )}
                  <p className="text-xs text-[#48544D] mt-1.5">
                    {[
                      editableCv.email,
                      editableCv.phone,
                      editableCv.location,
                      ...(editableCv.links || []),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>

                {editableCv.summary?.trim() && (
                  <section>
                    <h3
                      className="text-xs font-bold tracking-wider uppercase pb-1 border-b"
                      style={{
                        color: accentHex,
                        borderColor: templateStyle === 'ats-classic' ? '#CBD5CE' : accentHex,
                      }}
                    >
                      {isEn ? 'Professional Summary' : 'Profil Professionnel'}
                    </h3>
                    <p className="mt-2 text-xs leading-relaxed text-[#242E29]">
                      {editableCv.summary}
                    </p>
                  </section>
                )}

                {editableCv.experiences.length > 0 && (
                  <section>
                    <h3
                      className="text-xs font-bold tracking-wider uppercase pb-1 border-b"
                      style={{
                        color: accentHex,
                        borderColor: templateStyle === 'ats-classic' ? '#CBD5CE' : accentHex,
                      }}
                    >
                      {isEn ? 'Work Experience' : 'Expérience Professionnelle'}
                    </h3>
                    <div className="mt-2.5 space-y-3.5">
                      {editableCv.experiences.map((exp, idx) => (
                        <div key={idx}>
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="text-xs font-bold text-[#141C18]">{exp.role}</p>
                            <span className="text-xs font-mono-tabular text-[#48544D] shrink-0">
                              {exp.period}
                            </span>
                          </div>
                          <p className="text-xs font-semibold" style={{ color: accentHex }}>
                            {[exp.company, exp.location].filter(Boolean).join(' — ')}
                          </p>
                          <ul className="mt-1 space-y-1 text-xs text-[#242E29] list-disc pl-4">
                            {exp.bullets
                              .filter((b) => b.trim())
                              .map((bullet, bIdx) => (
                                <li key={bIdx} className="leading-relaxed">
                                  {bullet}
                                </li>
                              ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {editableCv.education.length > 0 && (
                  <section>
                    <h3
                      className="text-xs font-bold tracking-wider uppercase pb-1 border-b"
                      style={{
                        color: accentHex,
                        borderColor: templateStyle === 'ats-classic' ? '#CBD5CE' : accentHex,
                      }}
                    >
                      {isEn ? 'Education' : 'Formation'}
                    </h3>
                    <div className="mt-2 space-y-2">
                      {editableCv.education.map((edu, idx) => (
                        <div key={idx} className="flex items-baseline justify-between gap-2">
                          <div>
                            <p className="text-xs font-bold text-[#141C18]">{edu.degree}</p>
                            <p className="text-xs text-[#48544D]">{edu.school}</p>
                          </div>
                          <span className="text-xs font-mono-tabular text-[#48544D] shrink-0">
                            {edu.period}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {editableCv.skills.length > 0 && (
                  <section>
                    <h3
                      className="text-xs font-bold tracking-wider uppercase pb-1 border-b"
                      style={{
                        color: accentHex,
                        borderColor: templateStyle === 'ats-classic' ? '#CBD5CE' : accentHex,
                      }}
                    >
                      {isEn ? 'Skills' : 'Compétences'}
                    </h3>
                    <p className="mt-2 text-xs text-[#242E29] leading-relaxed">
                      {editableCv.skills.join(' · ')}
                    </p>
                  </section>
                )}

                {editableCv.languages.length > 0 && (
                  <section>
                    <h3
                      className="text-xs font-bold tracking-wider uppercase pb-1 border-b"
                      style={{
                        color: accentHex,
                        borderColor: templateStyle === 'ats-classic' ? '#CBD5CE' : accentHex,
                      }}
                    >
                      {isEn ? 'Languages' : 'Langues'}
                    </h3>
                    <p className="mt-2 text-xs text-[#242E29]">
                      {editableCv.languages.join(' · ')}
                    </p>
                  </section>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
