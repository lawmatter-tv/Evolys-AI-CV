import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileCheck2,
  FileEdit,
  FileText,
  Globe,
  MessageSquare,
  RefreshCw,
  Target,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { AppLanguage, CvAnalysisResult } from '../types';
import { ScoreGauge } from './ScoreGauge';

export type WorkspaceToolTarget =
  | 'line-feedback'
  | 'recreate'
  | 'job-feed'
  | 'compare-offer'
  | 'companies'
  | 'cover-letter'
  | 'interview';

interface AnalysisDashboardProps {
  analysis: CvAnalysisResult;
  targetRole: string;
  onUpdateTargetRole: (role: string) => void;
  onReanalyzeWithRole: () => void;
  onReplaceCv: () => void;
  onOpenTool: (tool: WorkspaceToolTarget) => void;
  language: AppLanguage;
  isReanalyzing: boolean;
}

export const AnalysisDashboard: React.FC<AnalysisDashboardProps> = ({
  analysis,
  targetRole,
  onUpdateTargetRole,
  onReanalyzeWithRole,
  onReplaceCv,
  onOpenTool,
  language,
  isReanalyzing,
}) => {
  const [showAllFormatChecks, setShowAllFormatChecks] = useState(false);
  const [showPassedContent, setShowPassedContent] = useState(false);
  const [editingRole, setEditingRole] = useState(false);

  const isEn = language === 'en';
  const visibleChecks = showAllFormatChecks
    ? analysis.atsChecks
    : analysis.atsChecks.slice(0, 5);

  const radarData = useMemo(() => {
    const metrics = analysis.radarMetrics;
    const skillsCount = analysis.structuredCv.skills?.length || 0;
    const fallbackSkills = Math.min(96, Math.max(40, skillsCount * 7 + 30));
    const checkScore = (id: string, fallback: number) => {
      const found = analysis.atsChecks.find((c) => c.id === id);
      if (!found || found.maxPoints <= 0) return fallback;
      return Math.round((found.pointsEarned / found.maxPoints) * 100);
    };

    const resolved = {
      atsCompatibility: metrics?.atsCompatibility ?? analysis.formatScore,
      skillRelevance: metrics?.skillRelevance ?? fallbackSkills,
      experienceImpact: metrics?.experienceImpact ?? analysis.contentScore,
      quantifiedResults:
        metrics?.quantifiedResults ?? Math.max(25, analysis.contentScore - 12),
      sectionStructure:
        metrics?.sectionStructure ?? checkScore('clear_headings', analysis.formatScore),
      readability:
        metrics?.readability ?? checkScore('readable_text', analysis.formatScore),
    };

    return [
      {
        axis: isEn ? 'ATS Fit' : 'Compatibilité ATS',
        score: resolved.atsCompatibility,
        fullMark: 100,
      },
      {
        axis: isEn ? 'Skills' : 'Compétences',
        score: resolved.skillRelevance,
        fullMark: 100,
      },
      {
        axis: isEn ? 'Impact' : 'Impact exp.',
        score: resolved.experienceImpact,
        fullMark: 100,
      },
      {
        axis: isEn ? 'Metrics' : 'Résultats chiffrés',
        score: resolved.quantifiedResults,
        fullMark: 100,
      },
      {
        axis: isEn ? 'Structure' : 'Structure',
        score: resolved.sectionStructure,
        fullMark: 100,
      },
      {
        axis: isEn ? 'Clarity' : 'Lisibilité',
        score: resolved.readability,
        fullMark: 100,
      },
    ];
  }, [analysis, isEn]);

  const renderStatusIcon = (status: string) => {
    if (status === 'passed') {
      return <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--status-ok)' }} />;
    }
    if (status === 'warning') {
      return <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: 'var(--status-warn)' }} />;
    }
    return <XCircle className="w-4 h-4 shrink-0" style={{ color: 'var(--status-err)' }} />;
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Contextual File & Role Bar */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-4 sm:px-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-text)] flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
              {analysis.fileName}
            </p>
            <p className="text-xs text-[var(--text-secondary)] truncate">
              {analysis.structuredCv.fullName || (isEn ? 'Parsed CV' : 'CV analysé')}
              {targetRole ? ` · ${targetRole}` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setEditingRole(!editingRole)}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] bg-[var(--bg-grouped)] hover:bg-[var(--bg-elevated)] border border-[var(--border-hairline)] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Target className="w-3.5 h-3.5 text-[var(--accent-text)]" />
            {isEn ? 'Target role' : 'Poste visé'}
          </button>
          <button
            type="button"
            onClick={onReplaceCv}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[var(--accent-text)] bg-[var(--accent-soft)] hover:opacity-85 rounded-xl transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {isEn ? 'Replace' : 'Remplacer'}
          </button>
          <button
            type="button"
            onClick={() => onOpenTool('recreate')}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileEdit className="w-3.5 h-3.5" />
            {isEn ? 'Recreate CV & PDF' : 'Recréer en PDF'}
          </button>
        </div>
      </div>

      {editingRole && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-2xl p-4 sm:px-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <input
            type="text"
            value={targetRole}
            onChange={(e) => onUpdateTargetRole(e.target.value)}
            placeholder={
              isEn
                ? 'Enter target job title...'
                : 'Indiquez le poste visé (ex : Responsable RH, Développeur Web)...'
            }
            className="flex-1 min-h-[44px] px-3.5 py-2 text-sm bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl text-[var(--text-primary)]"
          />
          <button
            type="button"
            disabled={isReanalyzing}
            onClick={() => {
              setEditingRole(false);
              onReanalyzeWithRole();
            }}
            className="min-h-[44px] px-5 py-2 text-xs font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            {isReanalyzing
              ? isEn
                ? 'Updating...'
                : 'Actualisation...'
              : isEn
                ? 'Recalculate for role'
                : 'Actualiser l’audit'}
          </button>
        </div>
      )}

      {/* Signature Dual Score Summary + Recharts 6-Criteria Radar */}
      <section className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6 sm:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-5 flex flex-col items-center gap-6">
            <div className="flex items-center justify-center gap-8 sm:gap-12">
              <ScoreGauge
                score={analysis.formatScore}
                label="FORMAT ATS"
                verdict={analysis.formatVerdict}
              />
              <ScoreGauge
                score={analysis.contentScore}
                label={isEn ? 'CONTENT' : 'CONTENU'}
                verdict={analysis.contentVerdict}
              />
            </div>

            {/* 6-Criteria Radar Chart (Recharts) */}
            <div className="w-full bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-2xl p-4">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  {isEn ? '6-Axis Performance Radar' : 'Radar de performance (6 critères)'}
                </h2>
                <span className="text-[11px] font-mono-tabular text-[var(--accent-text)] font-semibold">
                  0 — 100
                </span>
              </div>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="72%" data={radarData}>
                    <PolarGrid stroke="var(--border-strong)" />
                    <PolarAngleAxis
                      dataKey="axis"
                      tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 600 }}
                    />
                    <PolarRadiusAxis
                      angle={30}
                      domain={[0, 100]}
                      tick={{ fill: 'var(--text-tertiary)', fontSize: 9 }}
                    />
                    <Radar
                      name={isEn ? 'CV Score' : 'Score CV'}
                      dataKey="score"
                      stroke="var(--accent-text)"
                      strokeWidth={2}
                      fill="var(--accent-text)"
                      fillOpacity={0.26}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-hairline)',
                        borderRadius: '12px',
                        fontSize: '12px',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 space-y-4">
            <div className="p-5 bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-2xl">
              <p className="text-base font-semibold text-[var(--text-primary)] leading-snug">
                {analysis.summaryBanner}
              </p>
              <p className="mt-2 text-xs text-[var(--text-secondary)] font-mono-tabular">
                {isEn
                  ? `Format ${analysis.formatScore}/100 · Content ${analysis.contentScore}/100 · Recoverable potential: +${analysis.potentialGainPoints} pts`
                  : `Format ${analysis.formatScore}/100 · Contenu ${analysis.contentScore}/100 · Potentiel d’amélioration : +${analysis.potentialGainPoints} pts`}
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {radarData.map((item) => (
                <div
                  key={item.axis}
                  className="p-3 bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl"
                >
                  <p className="text-[11px] text-[var(--text-secondary)] truncate">{item.axis}</p>
                  <p className="font-mono-tabular text-sm font-bold text-[var(--text-primary)] mt-0.5">
                    {item.score}/100
                  </p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3 pt-1">
              <button
                type="button"
                onClick={() => onOpenTool('recreate')}
                className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Zap className="w-4 h-4" />
                {isEn ? 'Recreate optimized CV' : 'Améliorer et recréer le CV'}
              </button>
              <button
                type="button"
                onClick={() => onOpenTool('job-feed')}
                className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-[var(--accent-text)] bg-[var(--accent-soft)] rounded-xl transition-opacity hover:opacity-90 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5" />
                {isEn ? 'Browse local jobs & adapt' : 'Offres locales & Adapter CV'}
              </button>
              <button
                type="button"
                onClick={() => onOpenTool('line-feedback')}
                className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-[var(--text-primary)] bg-[var(--bg-grouped)] hover:bg-[var(--bg-elevated)] border border-[var(--border-hairline)] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isEn ? 'Line-by-line AI rewrites' : 'Retours IA ligne par ligne'}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Main Diagnostic Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Score ATS + Quick Wins */}
        <div className="lg:col-span-5 space-y-6">
          <section className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-[var(--text-primary)]">Score ATS</h2>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5 font-mono-tabular">
                  Format {analysis.formatScore}/100 · {analysis.formatVerdict}
                </p>
              </div>
              <span className="text-xs font-semibold text-[var(--accent-text)] font-mono-tabular">
                +{analysis.potentialGainPoints} pts
              </span>
            </div>

            <div className="mt-4 p-3.5 bg-[var(--accent-soft)] rounded-xl">
              <p className="text-xs font-semibold text-[var(--accent-text)]">
                {isEn
                  ? `Improvement potential: up to +${analysis.potentialGainPoints} pts`
                  : `Potentiel d’amélioration : jusqu’à +${analysis.potentialGainPoints} pts`}
              </p>
            </div>

            <ul className="mt-4 divide-y divide-[var(--border-hairline)]">
              {visibleChecks.map((check) => (
                <li key={check.id} className="py-3 first:pt-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {renderStatusIcon(check.status)}
                      <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                        {check.label}
                      </span>
                    </div>
                    <span className="font-mono-tabular text-xs font-semibold text-[var(--text-secondary)] shrink-0">
                      {check.pointsEarned}/{check.maxPoints}
                    </span>
                  </div>
                  {check.status !== 'passed' && (
                    <p className="mt-1 pl-6 text-xs" style={{ color: 'var(--status-err)' }}>
                      {check.finding}
                    </p>
                  )}
                  {showAllFormatChecks && (
                    <div className="mt-1.5 pl-6 text-xs text-[var(--text-secondary)] space-y-1">
                      <p>{check.explanation}</p>
                      {check.status !== 'passed' && (
                        <p className="text-[var(--accent-text)] font-medium">→ {check.howToFix}</p>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => setShowAllFormatChecks(!showAllFormatChecks)}
              className="mt-4 w-full min-h-[44px] py-2.5 px-4 text-xs font-semibold text-[var(--text-primary)] bg-[var(--bg-grouped)] hover:bg-[var(--bg-elevated)] border border-[var(--border-hairline)] rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              {showAllFormatChecks ? (
                <>
                  {isEn ? 'Collapse detailed checks' : 'Réduire le détail complet'}
                  <ChevronUp className="w-4 h-4" />
                </>
              ) : (
                <>
                  {isEn
                    ? `Show all ${analysis.atsChecks.length} checks explained`
                    : `Voir les ${analysis.atsChecks.length} vérifications expliquées`}
                  <ChevronDown className="w-4 h-4" />
                </>
              )}
            </button>
          </section>

          <section className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6">
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              {isEn ? 'Quick Wins' : 'Gains rapides'}
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              {isEn
                ? 'Fastest point gains to apply first.'
                : 'Les gains de points les plus rapides à appliquer.'}
            </p>
            <div className="mt-4 divide-y divide-[var(--border-hairline)]">
              {analysis.quickWins.map((qw) => (
                <div key={qw.id} className="py-3 first:pt-0 last:pb-0 flex items-start gap-3">
                  <span className="font-mono-tabular text-xs font-bold text-[var(--accent-text)] bg-[var(--accent-soft)] px-2 py-1 rounded-md shrink-0">
                    +{qw.pointsGain}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{qw.title}</p>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                      {qw.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => onOpenTool('recreate')}
              className="mt-4 w-full min-h-[44px] py-2.5 px-4 text-xs font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-xl transition-colors cursor-pointer"
            >
              {isEn ? 'Apply & recreate CV' : 'Appliquer et recréer le CV'}
            </button>
          </section>
        </div>

        {/* Right: Content Score + Action Dock */}
        <div className="lg:col-span-7 space-y-6">
          <section className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-[var(--text-primary)]">
                  {isEn ? 'Content Score' : 'Score de contenu'}
                </h2>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {isEn
                    ? 'Writing clarity & measurable impact independently of layout.'
                    : 'Qualité rédactionnelle et impact — indépendamment de la mise en page.'}
                </p>
              </div>
              <span className="font-mono-tabular text-sm font-bold text-[var(--text-primary)]">
                {analysis.contentScore}/100
              </span>
            </div>

            <div className="mt-4 border border-[var(--border-hairline)] rounded-2xl">
              <button
                type="button"
                onClick={() => setShowPassedContent(!showPassedContent)}
                className="w-full min-h-[44px] px-4 py-3 flex items-center justify-between text-left cursor-pointer"
              >
                <span
                  className="inline-flex items-center gap-2 text-sm font-semibold"
                  style={{ color: 'var(--status-ok)' }}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {analysis.contentPassedChecks.length}{' '}
                  {isEn ? 'passed checks' : 'vérifications réussies'}
                </span>
                {showPassedContent ? (
                  <ChevronUp className="w-4 h-4 text-[var(--text-secondary)]" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[var(--text-secondary)]" />
                )}
              </button>
              {showPassedContent && (
                <div className="px-4 pb-3 pt-2 border-t border-[var(--border-hairline)] space-y-2">
                  {analysis.contentPassedChecks.map((item, idx) => (
                    <div key={idx} className="text-xs leading-relaxed">
                      <span className="font-semibold text-[var(--text-primary)]">{item.title} : </span>
                      <span className="text-[var(--text-secondary)]">{item.detail}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-5 space-y-4">
              <p className="text-xs font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
                {isEn ? 'To Fix' : 'À corriger'}
              </p>
              <div className="divide-y divide-[var(--border-hairline)] border border-[var(--border-hairline)] rounded-2xl">
                {analysis.contentIssues.map((issue) => (
                  <div key={issue.id} className="p-5 space-y-3">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle
                        className="w-4 h-4 shrink-0 mt-0.5"
                        style={{
                          color:
                            issue.severity === 'high' ? 'var(--status-err)' : 'var(--status-warn)',
                        }}
                      />
                      <div>
                        <h3 className="text-sm font-bold text-[var(--text-primary)]">
                          {issue.title}
                        </h3>
                        <p className="text-xs font-medium mt-0.5" style={{ color: 'var(--status-err)' }}>
                          {issue.summary}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2.5 text-xs leading-relaxed pl-6">
                      <div>
                        <p className="font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
                          {isEn ? 'Why it matters' : 'Pourquoi c’est important'}
                        </p>
                        <p className="text-[var(--text-primary)] mt-0.5">{issue.whyItMatters}</p>
                      </div>
                      {issue.fromYourCv && (
                        <div className="p-3 bg-[var(--bg-grouped)] border border-[var(--border-hairline)] rounded-xl">
                          <p className="font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
                            {isEn ? 'From your CV' : 'De votre CV'}
                          </p>
                          <p className="text-[var(--text-primary)] italic mt-0.5">
                            « {issue.fromYourCv} »
                          </p>
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-[var(--accent-text)] uppercase tracking-wide">
                          {isEn ? 'How to improve' : 'Comment l’améliorer'}
                        </p>
                        <p className="text-[var(--text-primary)] mt-0.5">{issue.howToImprove}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* 7-Tool Action Dock */}
          <section className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-3xl p-6">
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              {isEn ? 'Improve, Tailor & Apply' : 'Améliorer, adapter et postuler'}
            </h2>
            <div className="mt-4 divide-y divide-[var(--border-hairline)] border border-[var(--border-hairline)] rounded-2xl overflow-hidden">
              {[
                {
                  id: 'recreate' as WorkspaceToolTarget,
                  icon: FileCheck2,
                  title: isEn ? 'Improve & Recreate CV + PDF' : 'Améliorer mon CV + Export PDF',
                  desc: isEn
                    ? 'ATS-clean rebuild & selectable PDF download'
                    : 'Un geste → CV recréé, éditable et prêt en PDF',
                },
                {
                  id: 'job-feed' as WorkspaceToolTarget,
                  icon: Globe,
                  title: isEn
                    ? 'Local & Global Job Feed (LinkedIn, Indeed, CI...)'
                    : 'Offres locales & internationales (Emploi Jeunes CI, Jobivoire, LinkedIn...)',
                  desc: isEn
                    ? 'Pick a live job or paste an external URL and tailor your CV to it'
                    : 'Choisissez une offre ou importez un lien pour réadapter votre CV sur mesure',
                },
                {
                  id: 'line-feedback' as WorkspaceToolTarget,
                  icon: FileEdit,
                  title: isEn ? 'Line-by-Line AI Feedback' : 'Retour IA ligne par ligne',
                  desc: isEn
                    ? 'Concrete rewrites grounded in your real CV'
                    : 'Reformulations concrètes, sans rien inventer',
                },
                {
                  id: 'compare-offer' as WorkspaceToolTarget,
                  icon: Target,
                  title: isEn ? 'Compare & Tailor to External Offer' : 'Comparer & Adapter à une offre externe',
                  desc: isEn
                    ? 'Keyword match + one-click tailored CV rebuild'
                    : 'Mots-clés manquants + réécriture immédiate du CV pour l’offre',
                },
                {
                  id: 'companies' as WorkspaceToolTarget,
                  icon: Building2,
                  title: isEn ? 'Company Match · 5 Giants' : 'Compatibilité entreprise · 5 géants',
                  desc: isEn
                    ? 'Evaluate readiness against 5 major employers'
                    : 'Note et écarts face à 5 grands recruteurs',
                },
                {
                  id: 'cover-letter' as WorkspaceToolTarget,
                  icon: Briefcase,
                  title: isEn ? 'Tailored Cover Letter & Gmail Send' : 'Lettre de motivation & Envoi Gmail',
                  desc: isEn
                    ? 'Draft grounded in your CV and send directly via Gmail'
                    : 'Rédigée avec vos faits réels et envoyée directement via Gmail',
                },
                {
                  id: 'interview' as WorkspaceToolTarget,
                  icon: MessageSquare,
                  title: isEn ? 'Interview Prep (STAR Method)' : 'Préparation à l’entretien (Méthode STAR)',
                  desc: isEn
                    ? 'Personalized questions & STAR answers based on CV + job offer'
                    : 'Questions personnalisées et réponses STAR basées sur le CV et l’offre',
                },
              ].map((tool) => {
                const Icon = tool.icon;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => onOpenTool(tool.id)}
                    className="w-full min-h-[56px] p-4 flex items-center gap-3.5 text-left bg-[var(--bg-surface)] hover:bg-[var(--bg-grouped)] transition-colors cursor-pointer group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-text)] flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-text)]">
                        {tool.title}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">{tool.desc}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-[var(--text-secondary)] group-hover:text-[var(--accent-text)] shrink-0" />
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
