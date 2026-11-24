import { jsPDF } from 'jspdf';
import { AppLanguage, StructuredCvData } from '../types';

export type CvTemplateStyle = 'ats-classic' | 'evolys-modern' | 'executive';

export function exportCvToPdf(
  cv: StructuredCvData,
  template: CvTemplateStyle = 'evolys-modern',
  language: AppLanguage = 'fr'
) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 16;
  const contentWidth = pageWidth - marginX * 2;
  let y = 18;

  const accentColor: [number, number, number] =
    template === 'evolys-modern'
      ? [12, 74, 46]
      : template === 'executive'
        ? [24, 34, 48]
        : [20, 28, 24];

  const mutedColor: [number, number, number] = [82, 96, 88];
  const bodyColor: [number, number, number] = [28, 36, 32];

  const ensureSpace = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - 16) {
      doc.addPage();
      y = 18;
    }
  };

  const labels =
    language === 'en'
      ? {
          summary: 'PROFESSIONAL SUMMARY',
          experience: 'WORK EXPERIENCE',
          education: 'EDUCATION',
          skills: 'SKILLS',
          languages: 'LANGUAGES',
          certifications: 'CERTIFICATIONS',
        }
      : {
          summary: 'PROFIL PROFESSIONNEL',
          experience: 'EXPÉRIENCE PROFESSIONNELLE',
          education: 'FORMATION',
          skills: 'COMPÉTENCES',
          languages: 'LANGUES',
          certifications: 'CERTIFICATIONS',
        };

  const addSectionHeader = (title: string) => {
    ensureSpace(12);
    y += 3;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...accentColor);
    doc.text(title, marginX, y);
    y += 2;
    const lineColor: [number, number, number] =
      template === 'ats-classic' ? [180, 185, 182] : accentColor;
    doc.setDrawColor(lineColor[0], lineColor[1], lineColor[2]);
    doc.setLineWidth(template === 'evolys-modern' ? 0.5 : 0.3);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 5;
  };

  // Header
  if (template === 'evolys-modern') {
    doc.setFillColor(...accentColor);
    doc.rect(marginX, 12, contentWidth, 1.5, 'F');
    y = 20;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.setTextColor(...accentColor);
  doc.text(cv.fullName || 'Candidat', marginX, y);
  y += 6.5;

  if (cv.headline) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11.5);
    doc.setTextColor(...bodyColor);
    const headlineLines = doc.splitTextToSize(cv.headline, contentWidth);
    doc.text(headlineLines, marginX, y);
    y += headlineLines.length * 5;
  }

  const contactParts = [cv.email, cv.phone, cv.location, ...(cv.links || [])].filter(Boolean);
  if (contactParts.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.2);
    doc.setTextColor(...mutedColor);
    const contactText = contactParts.join('  •  ');
    const contactLines = doc.splitTextToSize(contactText, contentWidth);
    doc.text(contactLines, marginX, y);
    y += contactLines.length * 4.2 + 2;
  }

  // Summary
  if (cv.summary?.trim()) {
    addSectionHeader(labels.summary);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.8);
    doc.setTextColor(...bodyColor);
    const lines = doc.splitTextToSize(cv.summary.trim(), contentWidth);
    ensureSpace(lines.length * 4.6 + 2);
    doc.text(lines, marginX, y);
    y += lines.length * 4.6 + 2;
  }

  // Experience
  if (cv.experiences && cv.experiences.length > 0) {
    addSectionHeader(labels.experience);
    for (const exp of cv.experiences) {
      ensureSpace(16);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(...bodyColor);
      doc.text(exp.role || '', marginX, y);

      if (exp.period) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.2);
        doc.setTextColor(...mutedColor);
        doc.text(exp.period, pageWidth - marginX, y, { align: 'right' });
      }
      y += 4.5;

      const subLine = [exp.company, exp.location].filter(Boolean).join(' — ');
      if (subLine) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(...accentColor);
        doc.text(subLine, marginX, y);
        y += 4.8;
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(...bodyColor);
      for (const bullet of exp.bullets || []) {
        if (!bullet.trim()) continue;
        const bulletLines = doc.splitTextToSize(bullet.trim(), contentWidth - 5);
        ensureSpace(bulletLines.length * 4.4 + 2);
        doc.text('•', marginX + 1, y);
        doc.text(bulletLines, marginX + 5, y);
        y += bulletLines.length * 4.4 + 1;
      }
      y += 2.5;
    }
  }

  // Education
  if (cv.education && cv.education.length > 0) {
    addSectionHeader(labels.education);
    for (const edu of cv.education) {
      ensureSpace(12);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...bodyColor);
      doc.text(edu.degree || '', marginX, y);

      if (edu.period) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...mutedColor);
        doc.text(edu.period, pageWidth - marginX, y, { align: 'right' });
      }
      y += 4.5;

      if (edu.school) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.4);
        doc.setTextColor(...mutedColor);
        doc.text(edu.school, marginX, y);
        y += 4.4;
      }
      if (edu.details) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.2);
        doc.setTextColor(...bodyColor);
        const detLines = doc.splitTextToSize(edu.details, contentWidth);
        ensureSpace(detLines.length * 4.2 + 2);
        doc.text(detLines, marginX, y);
        y += detLines.length * 4.2;
      }
      y += 2;
    }
  }

  // Skills
  if (cv.skills && cv.skills.length > 0) {
    addSectionHeader(labels.skills);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...bodyColor);
    const skillsText = cv.skills.join('  •  ');
    const skillLines = doc.splitTextToSize(skillsText, contentWidth);
    ensureSpace(skillLines.length * 4.5 + 2);
    doc.text(skillLines, marginX, y);
    y += skillLines.length * 4.5 + 2;
  }

  // Languages & Certifications
  if (cv.languages && cv.languages.length > 0) {
    addSectionHeader(labels.languages);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...bodyColor);
    const langLines = doc.splitTextToSize(cv.languages.join('  •  '), contentWidth);
    ensureSpace(langLines.length * 4.5 + 2);
    doc.text(langLines, marginX, y);
    y += langLines.length * 4.5 + 2;
  }

  if (cv.certifications && cv.certifications.length > 0) {
    addSectionHeader(labels.certifications);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...bodyColor);
    for (const cert of cv.certifications) {
      const cLines = doc.splitTextToSize(`•  ${cert}`, contentWidth);
      ensureSpace(cLines.length * 4.4 + 1);
      doc.text(cLines, marginX, y);
      y += cLines.length * 4.4 + 1;
    }
  }

  const safeFileName = (cv.fullName || 'CV_EVOLYS')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_');
  doc.save(`${safeFileName}_ATS_EVOLYS.pdf`);
}

export function exportCoverLetterToPdf(
  fullText: string,
  candidateName: string,
  companyName: string
) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  const marginX = 20;
  const contentWidth = 170;
  let y = 24;

  doc.setFillColor(12, 74, 46);
  doc.rect(marginX, 14, contentWidth, 1.2, 'F');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(28, 36, 32);

  const lines = doc.splitTextToSize(fullText, contentWidth);
  for (const line of lines) {
    if (y > 278) {
      doc.addPage();
      y = 22;
    }
    doc.text(line, marginX, y);
    y += 5.2;
  }

  const safeName = `${candidateName || 'Candidat'}_${companyName || 'Entreprise'}`
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_');
  doc.save(`Lettre_Motivation_${safeName}.pdf`);
}
