export const MAIN_SCOPE_LABEL = 'MAIN';

type ScopeSource = {
  branch?: string | null;
  branch_name?: string | null;
  client_branch?: string | null;
  department_name?: string | null;
  branch_count?: number | string | null;
  department_count?: number | string | null;
  clients?: {
    branch?: string | null;
  } | null;
};

const countValue = (value: ScopeSource['branch_count']) => {
  const count = Number(value);
  return Number.isFinite(count) ? count : null;
};

const cleanScope = (value?: string | null) => {
  const text = String(value || '').trim();
  if (!text) return '';
  return /^(main|main branch|primary|primary branch)$/i.test(text) ? MAIN_SCOPE_LABEL : text;
};

export const getBranchLabel = (source: ScopeSource) => {
  const count = countValue(source.branch_count);
  if (count !== null && count <= 1) return MAIN_SCOPE_LABEL;
  return cleanScope(source.branch_name || source.branch || source.client_branch || source.clients?.branch) || MAIN_SCOPE_LABEL;
};

export const getDepartmentLabel = (source: ScopeSource) => {
  const count = countValue(source.department_count);
  if (count !== null && count <= 1) return MAIN_SCOPE_LABEL;
  return cleanScope(source.department_name) || MAIN_SCOPE_LABEL;
};

export const getScopeLabel = (source: ScopeSource) => {
  const branch = getBranchLabel(source);
  const department = getDepartmentLabel(source);
  return branch === department ? branch : `${branch} / ${department}`;
};

export const getScopeCode = (value?: string | null) => {
  const label = cleanScope(value) || MAIN_SCOPE_LABEL;
  if (label === MAIN_SCOPE_LABEL) return MAIN_SCOPE_LABEL;
  const words = label.toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.map((word) => word[0]).join('').slice(0, 6) || MAIN_SCOPE_LABEL;
  return (words[0] || MAIN_SCOPE_LABEL).slice(0, 4);
};

export const getScopeFileSegment = (source: ScopeSource) => {
  const branch = getBranchLabel(source);
  const department = getDepartmentLabel(source);
  const branchCode = getScopeCode(branch);
  const departmentCode = getScopeCode(department);
  return branchCode === departmentCode ? branchCode : `${branchCode}-${departmentCode}`;
};