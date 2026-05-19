export type PoolFieldType = 'text' | 'number' | 'phone' | 'email' | 'select';

export interface PoolFieldDefinition {
  key: string;
  label: string;
  type: PoolFieldType;
  required: boolean;
  unique?: boolean;
  visible?: boolean;
  searchable?: boolean;
  mask?: 'none' | 'phone';
  options?: string[];
}

export interface ParticipantSchema {
  schemaVersion: 2;
  fields: PoolFieldDefinition[];
  uniqueField: string;
  displayTemplate: string;
}

export interface PoolMember {
  id: string;
  values: Record<string, string>;
  createdAt?: number;
  updatedAt?: number;
  source?: 'manual' | 'import' | 'generate' | 'register' | 'migration';
}

export interface DrawCandidate {
  id: string;
  poolId: string;
  poolName: string;
  probability: number;
  values: Record<string, string>;
  displayText: string;
}

export interface DisplayParticipant {
  id: string;
  displayText: string;
  values?: Record<string, string>;
}

export interface WinnerSnapshot {
  id: string;
  poolId?: string;
  poolName?: string;
  displayText: string;
  values: Record<string, string>;
  wonAt: number;
}

export const DEFAULT_PARTICIPANT_FIELDS: PoolFieldDefinition[] = [
  {
    key: 'number',
    label: '号码',
    type: 'text',
    required: true,
    unique: true,
    visible: true,
    searchable: true,
    mask: 'none',
  },
];

export const DEFAULT_PARTICIPANT_SCHEMA: ParticipantSchema = {
  schemaVersion: 2,
  fields: DEFAULT_PARTICIPANT_FIELDS,
  uniqueField: 'number',
  displayTemplate: '{number}',
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeFieldKey(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().replace(/[^\w]/g, '').slice(0, 40)
    : '';
}

function normalizeFieldType(value: unknown): PoolFieldType {
  return value === 'number' || value === 'phone' || value === 'email' || value === 'select'
    ? value
    : 'text';
}

export function normalizeFields(rawFields: unknown): PoolFieldDefinition[] {
  const seen = new Set<string>();
  const fields: PoolFieldDefinition[] = [];
  const source = Array.isArray(rawFields) && rawFields.length > 0
    ? rawFields
    : DEFAULT_PARTICIPANT_FIELDS;

  source.forEach((raw) => {
    if (!isObject(raw)) return;
    const key = normalizeFieldKey(raw.key);
    if (!key || seen.has(key)) return;
    seen.add(key);
    fields.push({
      key,
      label: typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : key,
      type: normalizeFieldType(raw.type),
      required: raw.required !== undefined ? Boolean(raw.required) : key === 'number',
      unique: Boolean(raw.unique),
      visible: raw.visible !== undefined ? Boolean(raw.visible) : true,
      searchable: raw.searchable !== undefined ? Boolean(raw.searchable) : true,
      mask: raw.mask === 'phone' ? 'phone' : 'none',
      options: Array.isArray(raw.options)
        ? raw.options.map(option => String(option).trim()).filter(Boolean)
        : undefined,
    });
  });

  if (!fields.some(field => field.key === 'number')) {
    fields.unshift({ ...DEFAULT_PARTICIPANT_FIELDS[0] });
  }

  return fields.length > 0 ? fields : DEFAULT_PARTICIPANT_FIELDS.map(field => ({ ...field }));
}

export function normalizeParticipantSchema(rawSchema: unknown): ParticipantSchema {
  const schema = isObject(rawSchema) ? rawSchema : {};
  const fields = normalizeFields(schema.fields);
  let uniqueField = normalizeFieldKey(schema.uniqueField);
  if (!uniqueField || !fields.some(field => field.key === uniqueField)) {
    uniqueField = 'number';
  }
  if (!fields.some(field => field.key === uniqueField)) {
    uniqueField = fields[0]?.key || 'number';
  }

  const normalizedFields = fields.map(field => ({
    ...field,
    required: field.key === uniqueField ? true : field.required,
    unique: field.key === uniqueField ? true : field.unique,
  }));

  const displayTemplate = typeof schema.displayTemplate === 'string' && schema.displayTemplate.trim()
    ? schema.displayTemplate.trim()
    : `{${uniqueField}}`;

  return {
    schemaVersion: 2,
    fields: normalizedFields,
    uniqueField,
    displayTemplate,
  };
}

export function normalizeFieldValue(value: unknown, field?: PoolFieldDefinition): string {
  const normalized = value === null || value === undefined ? '' : String(value).trim();
  if (field?.type === 'number') return normalized.replace(/\s+/g, '');
  return normalized;
}

export function getMemberId(values: Record<string, string>, schema: ParticipantSchema): string {
  return normalizeFieldValue(values[schema.uniqueField]);
}

export function createMemberFromId(id: string, schema = DEFAULT_PARTICIPANT_SCHEMA, source: PoolMember['source'] = 'migration'): PoolMember {
  const normalizedId = normalizeFieldValue(id);
  return {
    id: normalizedId,
    values: { [schema.uniqueField]: normalizedId },
    source,
  };
}

export function normalizeMember(
  raw: unknown,
  schema = DEFAULT_PARTICIPANT_SCHEMA,
  source: PoolMember['source'] = 'manual',
): PoolMember | null {
  if (typeof raw === 'string' || typeof raw === 'number') {
    const id = normalizeFieldValue(raw);
    return id ? createMemberFromId(id, schema, source) : null;
  }

  if (!isObject(raw)) return null;

  const rawValues = isObject(raw.values) ? raw.values : raw;
  const values: Record<string, string> = {};
  schema.fields.forEach((field) => {
    const value = normalizeFieldValue(rawValues[field.key], field);
    if (value) values[field.key] = value;
  });

  const rawId = typeof raw.id === 'string' ? normalizeFieldValue(raw.id) : '';
  const id = getMemberId(values, schema) || rawId;
  if (!id) return null;
  values[schema.uniqueField] = id;

  return {
    id,
    values,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : undefined,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : undefined,
    source: typeof raw.source === 'string' ? raw.source as PoolMember['source'] : source,
  };
}

export function normalizeMembers(
  rawMembers: unknown,
  schema = DEFAULT_PARTICIPANT_SCHEMA,
  source: PoolMember['source'] = 'manual',
): PoolMember[] {
  if (!Array.isArray(rawMembers)) return [];
  const seen = new Set<string>();
  const members: PoolMember[] = [];

  rawMembers.forEach((raw) => {
    const member = normalizeMember(raw, schema, source);
    if (!member || seen.has(member.id)) return;
    seen.add(member.id);
    members.push(member);
  });

  return members;
}

export function parseMembersFromText(
  input: string,
  schema = DEFAULT_PARTICIPANT_SCHEMA,
  source: PoolMember['source'] = 'import',
): PoolMember[] {
  const lines = input.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const splitRow = (line: string) => line.split(/[\t,，]/).map(item => item.trim());
  const fieldByKey = new Map(schema.fields.map(field => [field.key, field]));
  const headerKeyMap = new Map<string, string>();
  schema.fields.forEach((field) => {
    headerKeyMap.set(field.key, field.key);
    headerKeyMap.set(field.label, field.key);
  });

  const first = splitRow(lines[0]);
  const hasHeader = first.length > 0 && first.every(item => headerKeyMap.has(item));
  const defaultHeaders = [
    schema.uniqueField,
    ...schema.fields.filter(field => field.key !== schema.uniqueField).map(field => field.key),
  ];
  const headers = hasHeader ? first.map(item => headerKeyMap.get(item)!) : defaultHeaders;
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const seen = new Set<string>();
  const members: PoolMember[] = [];

  dataLines.forEach((line) => {
    const columns = splitRow(line);
    const parseAsFieldRow = hasHeader || (schema.fields.length > 1 && columns.length > 1);
    const rows = parseAsFieldRow
      ? [columns]
      : line.split(/[,\n\r\s，]+/).map(item => item.trim()).filter(Boolean).map(item => [item]);

    rows.forEach((row) => {
      const rowHeaders = parseAsFieldRow ? headers : [schema.uniqueField];
      const values: Record<string, string> = {};
      rowHeaders.forEach((key, index) => {
        const field = fieldByKey.get(key);
        const value = normalizeFieldValue(row[index], field);
        if (field && value) values[key] = value;
      });

      const id = getMemberId(values, schema);
      if (!id || seen.has(id)) return;
      seen.add(id);
      values[schema.uniqueField] = id;
      members.push({ id, values, source });
    });
  });

  return members;
}

export function getMemberIds(members: PoolMember[]): string[] {
  return members.map(member => member.id);
}

export function maskValue(value: string, field?: PoolFieldDefinition): string {
  if (field?.mask === 'phone' && value.length === 11) {
    return `${value.slice(0, 3)}****${value.slice(7)}`;
  }
  return value;
}

export function maskValues(values: Record<string, string>, fields: PoolFieldDefinition[]): Record<string, string> {
  const fieldByKey = new Map(fields.map(field => [field.key, field]));
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, maskValue(value, fieldByKey.get(key))]),
  );
}

export function renderDisplayText(
  valuesOrMember: PoolMember | Record<string, string>,
  schema = DEFAULT_PARTICIPANT_SCHEMA,
  options: { mask?: boolean } = {},
): string {
  const isMember = 'values' in valuesOrMember && typeof valuesOrMember.values === 'object';
  const values: Record<string, string> = isMember
    ? (valuesOrMember as PoolMember).values
    : valuesOrMember as Record<string, string>;
  const rendered = schema.displayTemplate.replace(/\{([\w]+)\}/g, (_match, key: string) => {
    const field = schema.fields.find(item => item.key === key);
    const value = values[key] || '';
    return options.mask ? maskValue(value, field) : value;
  }).replace(/\s+/g, ' ').trim();
  return rendered || values[schema.uniqueField] || (isMember ? (valuesOrMember as PoolMember).id : '');
}

export function createDrawCandidate(
  member: PoolMember,
  pool: { id: string; name: string },
  probability: number,
  schema = DEFAULT_PARTICIPANT_SCHEMA,
): DrawCandidate {
  return {
    id: member.id,
    poolId: pool.id,
    poolName: pool.name,
    probability,
    values: { ...member.values },
    displayText: renderDisplayText(member, schema, { mask: true }),
  };
}

export function createDisplayParticipant(candidate: DrawCandidate | PoolMember, schema = DEFAULT_PARTICIPANT_SCHEMA): DisplayParticipant {
  if ('poolId' in candidate) {
    return {
      id: candidate.id,
      displayText: candidate.displayText || renderDisplayText(candidate.values, schema, { mask: true }),
      values: maskValues(candidate.values, schema.fields),
    };
  }

  return {
    id: candidate.id,
    displayText: renderDisplayText(candidate, schema, { mask: true }),
    values: maskValues(candidate.values, schema.fields),
  };
}

export function createWinnerSnapshot(candidate: DrawCandidate, wonAt = Date.now()): WinnerSnapshot {
  return {
    id: candidate.id,
    poolId: candidate.poolId,
    poolName: candidate.poolName,
    displayText: candidate.displayText,
    values: { ...candidate.values },
    wonAt,
  };
}

export function getWinnerSnapshotIds(winners: WinnerSnapshot[] | undefined): string[] {
  return Array.isArray(winners) ? winners.map(winner => winner.id).filter(Boolean) : [];
}

export function getRequiredMemberError(members: PoolMember[], schema = DEFAULT_PARTICIPANT_SCHEMA): string | null {
  for (const member of members) {
    for (const field of schema.fields) {
      if (field.required && !member.values[field.key]) {
        return `${member.id || '成员'} 缺少必填字段：${field.label}`;
      }
    }
  }
  return null;
}

export function getAutoGenerateBlockReason(schema = DEFAULT_PARTICIPANT_SCHEMA): string | null {
  if (schema.fields.length <= 1) return null;
  return '当前已启用多字段参与者设置，用户池只能通过 CSV/批量导入维护，不能使用自动生成。';
}
