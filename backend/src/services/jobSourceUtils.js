import JobSource from '../models/JobSource.js';

// Checks the JobSource collection (managed from the admin panel) for
// whether a source is enabled and whether it has a DB-stored API key
// overriding the environment variable. Falls back to "enabled, use env
// var" if no JobSource document exists yet — so nothing breaks for a
// fresh install before the admin has visited the job-sources page.
export async function getSourceConfig(key, envVarValue, defaultEnabled = true) {
  const source = await JobSource.findOne({ key });
  if (!source) return { enabled: defaultEnabled, apiKey: envVarValue };
  return { enabled: source.enabled, apiKey: source.apiKey || envVarValue };
}

// A handful of sources need TWO credentials (e.g. Adzuna's app_id +
// app_key). Rather than adding more schema fields, these are stored as a
// single string "id:key" in JobSource.apiKey and split here.
export function splitPairedKey(combined) {
  if (!combined) return { id: null, key: null };
  const [id, key] = combined.split(':');
  return { id, key };
}

export function stripHtml(html = '') {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// Rough industry categorization from keywords, used as a fallback for any
// source that doesn't give a real category/industry field of its own.
// Not authoritative — good enough for browsing/filtering.
const INDUSTRY_KEYWORDS = {
  Technology: ['software', 'engineer', 'developer', 'devops', 'data scientist', 'it ', 'programmer', 'cloud', 'cybersecurity'],
  Finance: ['accountant', 'finance', 'financial', 'audit', 'tax', 'bookkeeping', 'investment', 'banking'],
  Healthcare: ['nurse', 'medical', 'health', 'clinical', 'pharmac', 'doctor', 'therapist'],
  Marketing: ['marketing', 'seo', 'content', 'brand', 'social media', 'growth'],
  Sales: ['sales', 'account executive', 'business development', 'account manager'],
  Design: ['designer', 'ux', 'ui', 'graphic', 'product design'],
  Education: ['teacher', 'tutor', 'instructor', 'education', 'lecturer'],
  'Customer Support': ['customer support', 'customer service', 'support agent', 'help desk'],
  Operations: ['operations', 'logistics', 'supply chain', 'warehouse', 'procurement'],
  'Human Resources': ['hr ', 'human resources', 'recruiter', 'talent acquisition'],
  'Mechanical Engineering': ['mechanical engineer', 'cad', 'solidworks', 'hvac design', 'manufacturing engineer'],
  Hospitality: ['hotel', 'restaurant', 'chef', 'concierge', 'hospitality', 'catering', 'housekeeping']
};

export function classifyIndustry(title = '', description = '') {
  const text = `${title} ${description}`.toLowerCase();
  for (const [industry, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) return industry;
  }
  return 'Other';
}

// Best-effort city/country name matching for sources that don't give a
// structured country field. Not real geocoding — good enough for
// filtering, not authoritative.
const CITY_TO_COUNTRY = {
  germany: ['frankfurt', 'berlin', 'münchen', 'munich', 'düsseldorf', 'hamburg', 'köln', 'cologne',
    'stuttgart', 'leipzig', 'dresden', 'nürnberg', 'nuremberg', 'hannover', 'bremen', 'essen',
    'dortmund', 'bonn', 'mannheim', 'karlsruhe', 'deutschland'],
  austria: ['wien', 'vienna', 'salzburg', 'graz', 'innsbruck', 'österreich'],
  switzerland: ['zürich', 'zurich', 'genf', 'geneva', 'basel', 'bern', 'lausanne', 'schweiz'],
  netherlands: ['amsterdam', 'rotterdam', 'den haag', 'the hague', 'utrecht', 'niederlande'],
  'united kingdom': ['london', 'manchester', 'birmingham', 'united kingdom'],
  france: ['paris', 'lyon', 'marseille', 'frankreich'],
  spain: ['madrid', 'barcelona', 'spanien'],
  poland: ['warsaw', 'warszawa', 'krakow', 'kraków', 'polen'],
  italy: ['milan', 'milano', 'rome', 'roma', 'italien'],
  'united states': ['usa', 'united states', 'new york', 'san francisco', 'los angeles'],
  nigeria: ['lagos', 'abuja', 'nigeria', 'port harcourt'],
  'south africa': ['johannesburg', 'cape town', 'south africa'],
  australia: ['sydney', 'melbourne', 'brisbane', 'perth', 'australia'],
  'new zealand': ['auckland', 'wellington', 'new zealand']
};

export function parseCountryFromText(location = '', description = '', remote = false, defaultCountry = null) {
  const text = `${location} ${description}`.toLowerCase();

  for (const [country, keywords] of Object.entries(CITY_TO_COUNTRY)) {
    if (keywords.some((kw) => text.includes(kw))) {
      return country.replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }

  return remote ? null : defaultCountry;
}

const COMMON_SKILLS = [
  'javascript', 'typescript', 'react', 'node', 'python', 'java', 'sql',
  'excel', 'figma', 'project management', 'communication', 'sales',
  'marketing', 'accounting', 'aws', 'docker', 'kubernetes'
];

export function extractSkillNamesFromText(text = '') {
  const lower = text.toLowerCase();
  return COMMON_SKILLS.filter((skill) => lower.includes(skill));
}
