import { CASE_LABELS, REVIEW_NEXT } from './cases.mjs';

export function createReviewActions({
  selected,
  busy,
  next,
  note,
  token,
  fileNotes,
  privateJson,
  refreshList,
  setBusy,
  setError,
  setMessage,
  setDecisionMessage,
  setSelected,
  setNext,
  setNote,
  setFileNotes,
  setFileMessages,
}) {
  const changeStatus = async (event) => {
    event.preventDefault();
    if (!selected || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    setDecisionMessage('');
    try {
      const item = await privateJson('/api/v1/review/cases/' + selected.id + '/status', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next, note }),
      });
      setSelected(item);
      setNext(REVIEW_NEXT[item.kind]?.[item.status]?.[0] || '');
      setNote('');
      setDecisionMessage(
        'Decision saved. Current status: ' +
          (CASE_LABELS[item.status] || item.status) +
          '.' +
          (note.trim() ? ' Your message is visible to the submitter.' : ''),
      );
      try {
        await refreshList();
      } catch {
        setMessage(
          'Decision saved, but the queue could not refresh. Refresh the queue to see its latest status.',
        );
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const decideFile = async (item, decision) => {
    const reason = (fileNotes[item.id] || '').trim();
    if (!reason) {
      setFileMessages((current) => ({
        ...current,
        [item.id]: 'Write a reason for the evidence decision. The submitter will see it.',
      }));
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    setFileMessages((current) => ({ ...current, [item.id]: '' }));
    try {
      const updated = await privateJson('/api/v1/review/evidence/' + item.id + '/decision', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note: reason }),
      });
      setSelected(updated);
      setFileNotes((current) => ({ ...current, [item.id]: '' }));
      setFileMessages((current) => ({ ...current, [item.id]: 'Evidence decision recorded.' }));
      try {
        await refreshList();
      } catch {
        setFileMessages((current) => ({
          ...current,
          [item.id]:
            'Evidence decision recorded, but the queue could not refresh. Refresh the queue to see its latest status.',
        }));
      }
    } catch (e) {
      setFileMessages((current) => ({ ...current, [item.id]: e.message }));
    } finally {
      setBusy(false);
    }
  };
  return { changeStatus, decideFile };
}
