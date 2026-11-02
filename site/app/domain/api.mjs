async function submitToRegistry(path, data) {
  if (location.protocol === 'file:')
    return { id: 'DEMO-' + Math.random().toString(36).slice(2, 10).toUpperCase(), demo: true };
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      result.error || 'The registry could not save this submission. Please try again.',
    );
  return result;
}

async function privateJson(path, token, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { ...options.headers, Authorization: 'Bearer ' + token },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'The request failed. Please try again.');
    error.status = response.status;
    throw error;
  }
  return data;
}

async function submitCaseEvidence(
  caseId,
  accessToken,
  kind,
  file,
  sourceStatement,
  onStored,
  refresh,
) {
  const response = await fetch('/api/v1/cases/' + caseId + '/evidence', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': file.type,
      'X-Evidence-Kind': kind,
      'X-File-Name': encodeURIComponent(file.name),
      'X-Evidence-Source': encodeURIComponent(sourceStatement.trim()),
    },
    body: file,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'The file could not be uploaded.');
  onStored();
  try {
    await refresh();
    return true;
  } catch {
    return false;
  }
}

export { submitToRegistry, privateJson, submitCaseEvidence };
