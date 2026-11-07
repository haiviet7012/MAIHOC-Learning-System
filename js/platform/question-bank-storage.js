import { api } from './api.js';
import { createLocalRepository, questionFingerprint } from './question-bank-model.js';

// Preserve existing browser questions; AI variants are authoritative in PostgreSQL.
export function createQuestionBankRepository(userId) {
  const local=createLocalRepository(userId);
  let remote=[];
  const isRemote=id=>remote.some(q=>q.id===id);
  return {
    async list() { remote=(await api('/api/question-bank/variants')).items; return [...remote,...local.list()]; },
    async clone(source,existing) {
      return api('/api/question-bank/variants',{method:'POST',body:{source,existingFingerprints:existing.map(questionFingerprint)}});
    },
    async save(question) {
      if([...remote,...local.list()].some(q=>q.id!==question.id && questionFingerprint(q)===questionFingerprint(question))) throw new Error('Câu hỏi đã có trong kho (trùng nội dung và phương án).');
      if(!isRemote(question.id)) return local.save(question);
      await api(`/api/question-bank/variants/${encodeURIComponent(question.id)}`,{method:'PATCH',body:question});return true;
    },
    approve: id=>local.approve(id),
    async remove(id) {
      if(!isRemote(id)) return local.remove(id);
      await api(`/api/question-bank/variants/${encodeURIComponent(id)}`,{method:'DELETE'}); return true;
    },
  };
}
