// Prompt Library - Save, display, delete prompts using localStorage
(function(){
  const KEY = 'promptLibrary.prompts';
  const NOTES_KEY = 'promptLibrary.notes';
  const DELETED_KEY = 'promptLibrary.notesDeleted';

  function qs(sel){ return document.querySelector(sel); }

  function loadPrompts(){
    try{
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    }catch(e){ return []; }
  }

  function savePrompts(list){
    localStorage.setItem(KEY, JSON.stringify(list));
  }

  function getPreview(text, words=8){
    if(!text) return '';
    const parts = text.trim().split(/\s+/);
    return parts.slice(0,words).join(' ') + (parts.length>words ? '…' : '');
  }

  function getLocalAnonId(){
    const K = 'promptLibrary.anonId';
    let id = localStorage.getItem(K);
    if(!id){
      id = 'anon-' + Math.random().toString(36).slice(2,10);
      localStorage.setItem(K, id);
    }
    return id;
  }

  // --- Metadata tracking utilities ---
  function formatDateNoSeconds(input){
    const d = (input instanceof Date) ? input : new Date(input);
    if(isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function isValidISODateString(s){
    if(typeof s !== 'string') return false;
    try{
      const d = new Date(s);
      if(isNaN(d.getTime())) return false;
      // ensure round-trip matches ISO format
      return d.toISOString() === s;
    }catch(e){ return false; }
  }

  function detectIsCode(text){
    if(!text || typeof text !== 'string') return false;
    const codeHints = ['function','{','}','=>','import ','def ','class ','console.log',';'];
    const lines = text.split('\n');
    const longLines = lines.length > 1;
    for(const hint of codeHints){ if(text.indexOf(hint) !== -1) return true; }
    return longLines && /\(|\)|\{|\}|;/.test(text);
  }

  function estimateTokens(text, isCode){
    if(typeof text !== 'string') throw new Error('estimateTokens: text must be a string');
    const words = text.trim().length ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    let min = 0.75 * words;
    let max = 0.25 * chars;
    if(isCode) { min *= 1.3; max *= 1.3; }
    // round to whole numbers
    min = Math.max(0, Math.round(min));
    max = Math.max(0, Math.round(max));

    const reference = Math.max(min, max);
    let confidence = 'high';
    if(reference >= 1000 && reference <= 5000) confidence = 'medium';
    else if(reference > 5000) confidence = 'low';

    return { min, max, confidence };
  }

  function trackModel(modelName, content){
    if(typeof modelName !== 'string' || !modelName.trim()) throw new Error('trackModel: modelName must be a non-empty string');
    if(modelName.length > 100) throw new Error('trackModel: modelName must be 100 characters or fewer');
    if(typeof content !== 'string') throw new Error('trackModel: content must be a string');

    const createdAt = new Date().toISOString();
    const isCode = detectIsCode(content);
    const tokenEstimate = estimateTokens(content, isCode);

    const metadata = {
      model: modelName.trim(),
      createdAt,
      updatedAt: createdAt,
      tokenEstimate
    };

    if(!isValidISODateString(metadata.createdAt) || !isValidISODateString(metadata.updatedAt)){
      throw new Error('trackModel: generated timestamps are invalid');
    }

    return metadata;
  }

  function updateTimestamps(metadata){
    if(!metadata || typeof metadata !== 'object') throw new Error('updateTimestamps: metadata required');
    if(!metadata.createdAt || !isValidISODateString(metadata.createdAt)) throw new Error('updateTimestamps: metadata.createdAt is missing or invalid ISO string');
    const updatedAt = new Date().toISOString();
    if(new Date(updatedAt).getTime() < new Date(metadata.createdAt).getTime()){
      throw new Error('updateTimestamps: updatedAt is earlier than createdAt');
    }
    metadata.updatedAt = updatedAt;
    if(!isValidISODateString(metadata.updatedAt)) throw new Error('updateTimestamps: updatedAt is not a valid ISO string');
    return metadata;
  }

  function createMetadataElement(metadata){
    const wrap = document.createElement('div');
    wrap.className = 'metadata';
    try{
      if(metadata && typeof metadata === 'object'){
        // Top row: model (left) and token/confidence (right)
        const topRow = document.createElement('div'); topRow.className = 'metadata-row top';
        const modelEl = document.createElement('div'); modelEl.className='meta-model'; modelEl.textContent = metadata.model || '';
        const token = document.createElement('div'); token.className = 'token-estimate';
        if(metadata.tokenEstimate){
          const te = metadata.tokenEstimate;
          const confClass = te.confidence === 'high' ? 'confidence-high' : (te.confidence === 'medium' ? 'confidence-medium' : 'confidence-low');
          token.innerHTML = `<span class="token-range">${te.min}–${te.max} tokens</span> <span class="token-confidence ${confClass}">${te.confidence}</span>`;
        }
        topRow.appendChild(modelEl);
        topRow.appendChild(token);

        // Second row: created and updated timestamps
        const timesRow = document.createElement('div'); timesRow.className = 'metadata-row times';
        const created = metadata.createdAt && isValidISODateString(metadata.createdAt) ? formatDateNoSeconds(metadata.createdAt) : '—';
        const updated = metadata.updatedAt && isValidISODateString(metadata.updatedAt) ? formatDateNoSeconds(metadata.updatedAt) : '—';
        timesRow.innerHTML = `<span class="meta-created">Created: ${created}</span><span class="meta-updated">Updated: ${updated}</span>`;

        wrap.appendChild(topRow);
        wrap.appendChild(timesRow);
      }
    }catch(e){ wrap.textContent = ''; }
    return wrap;
  }

  /* Notes persistence and helpers */
  function loadNotesMap(){
    try{
      const raw = localStorage.getItem(NOTES_KEY);
      return raw ? JSON.parse(raw) : {};
    }catch(e){ return {}; }
  }

  function loadNotes(promptId){
    const map = loadNotesMap();
    return map[String(promptId)] || [];
  }

  function saveNotesMap(map){
    try{
      localStorage.setItem(NOTES_KEY, JSON.stringify(map));
      return true;
    }catch(e){ return false; }
  }

  function saveNotes(promptId, notes){
    const map = loadNotesMap();
    map[String(promptId)] = notes;
    const ok = saveNotesMap(map);
    if(!ok) alert('Unable to save note — localStorage error or quota exceeded.');
    return ok;
  }

  function genNoteId(){ return 'note-' + Math.random().toString(36).slice(2,9); }

  function addNoteToPrompt(promptId, content){
    const notes = loadNotes(promptId);
    const now = Date.now();
    const note = { id: genNoteId(), content: String(content||'').trim(), createdAt: now, updatedAt: now };
    notes.push(note);
    if(saveNotes(promptId, notes)) return note;
    return null;
  }

  function editNote(promptId, noteId, content){
    const notes = loadNotes(promptId);
    const n = notes.find(x=> x.id === noteId);
    if(!n) return false;
    n.content = String(content||'').trim();
    n.updatedAt = Date.now();
    return saveNotes(promptId, notes);
  }

  function deleteNote(promptId, noteId){
    const notes = loadNotes(promptId);
    const idx = notes.findIndex(x=> x.id === noteId);
    if(idx === -1) return false;
    const removed = notes.splice(idx,1)[0];
    // store in recently deleted buffer (max 5)
    try{
      const raw = localStorage.getItem(DELETED_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      arr.unshift({ promptId: String(promptId), ...removed });
      if(arr.length>5) arr.length = 5;
      localStorage.setItem(DELETED_KEY, JSON.stringify(arr));
    }catch(e){ /* ignore */ }
    return saveNotes(promptId, notes);
  }

  function ensureRatingSummary(p){
    if(!p.ratingSummary) p.ratingSummary = { average: 0, count: 0, userRatings: {} };
  }

  function submitRating(promptId, score, userId = getLocalAnonId()){
    const prompts = loadPrompts();
    const p = prompts.find(x => String(x.id) === String(promptId));
    if(!p) return;
    ensureRatingSummary(p);

    score = Math.max(1, Math.min(5, Math.round(Number(score))));

    p.ratingSummary.userRatings[userId] = score;

    const values = Object.values(p.ratingSummary.userRatings);
    const sum = values.reduce((s,v)=>s+v,0);
    p.ratingSummary.count = values.length;
    p.ratingSummary.average = Math.round((sum / p.ratingSummary.count) * 10) / 10;

    savePrompts(prompts);
    renderPrompts();
  }

  function buildStars(prompt){
    ensureRatingSummary(prompt);
    const avg = prompt.ratingSummary.average || 0;
    const count = prompt.ratingSummary.count || 0;
    const userId = getLocalAnonId();
    const userScore = prompt.ratingSummary.userRatings[userId] || 0;

    const container = document.createElement('div');
    container.className = 'rating';

    const stars = document.createElement('div');
    stars.className = 'stars';
    stars.setAttribute('role','radiogroup');
    stars.setAttribute('aria-label', `Rate this prompt. Current average ${Math.round(avg)} out of 5`);

    for(let i=1;i<=5;i++){
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'star-button';
      btn.dataset.score = i;
      btn.dataset.promptId = prompt.id;
      btn.setAttribute('role','radio');
      btn.setAttribute('aria-checked', String(i===userScore));
      btn.title = `${i} star${i>1?'s':''}`;
      btn.innerHTML = '<svg class="icon-star" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path class="star-shape" d="M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24z"></path></svg>';

      if(userScore){
        if(i <= userScore) btn.classList.add('filled');
      } else {
        // show average as visual hint
        if(i <= Math.floor(avg)) btn.classList.add('filled');
        else if(i === Math.floor(avg)+1 && avg % 1 >= 0.5) btn.classList.add('half');
      }

      btn.addEventListener('click', (e)=>{
        submitRating(btn.dataset.promptId, btn.dataset.score);
      });

      btn.addEventListener('mouseover', ()=>{
        // preview
        const s = Number(btn.dataset.score);
        Array.from(stars.children).forEach((c, idx)=>{
          if(idx < s) c.classList.add('filled'); else c.classList.remove('filled');
        });
      });
      btn.addEventListener('mouseout', ()=>{
        // restore
        renderStarsVisual(stars, prompt);
      });

      btn.addEventListener('keydown', (ev)=>{
        const key = ev.key;
        if(key === 'ArrowLeft' || key === 'ArrowDown'){
          ev.preventDefault();
          const prev = btn.previousElementSibling;
          if(prev) prev.focus();
        }else if(key === 'ArrowRight' || key === 'ArrowUp'){
          ev.preventDefault();
          const next = btn.nextElementSibling;
          if(next) next.focus();
        }else if(key === 'Enter' || key === ' '){
          ev.preventDefault();
          btn.click();
        }
      });

      stars.appendChild(btn);
    }

    const meta = document.createElement('div');
    meta.className = 'rating-meta';
    const avgEl = document.createElement('div');
    avgEl.className = 'rating-avg';
    avgEl.textContent = (count ? `${Math.round(avg)} / 5` : 'Not rated');

    meta.appendChild(avgEl);

    container.appendChild(stars);
    container.appendChild(meta);

    // ensure visual correct
    renderStarsVisual(stars, prompt);

    return container;
  }

  function renderStarsVisual(starsEl, prompt){
    const avg = prompt.ratingSummary.average || 0;
    const userId = getLocalAnonId();
    const userScore = prompt.ratingSummary.userRatings[userId] || 0;
    const children = Array.from(starsEl.children);
    children.forEach((c, idx)=>{
      c.classList.remove('filled','half');
      const i = idx+1;
      if(userScore){
        if(i <= userScore) c.classList.add('filled');
        c.setAttribute('aria-checked', String(i===userScore));
      }else{
        if(i <= Math.floor(avg)) c.classList.add('filled');
        else if(i === Math.floor(avg)+1 && avg % 1 >= 0.5) c.classList.add('half');
        c.setAttribute('aria-checked', 'false');
      }
    });
  }

  function renderPrompts(){
    const container = qs('#prompts-container');
    const prompts = loadPrompts();
    container.innerHTML = '';

    if(prompts.length === 0){
      container.innerHTML = '<div class="empty-state">No prompts saved yet. Add one using the form.</div>';
      return;
    }

    // sort by metadata.createdAt descending, fallback to numeric id
    prompts.slice().sort((a,b)=>{
      const aTime = a.metadata && a.metadata.createdAt ? new Date(a.metadata.createdAt).getTime() : (a.id || 0);
      const bTime = b.metadata && b.metadata.createdAt ? new Date(b.metadata.createdAt).getTime() : (b.id || 0);
      return bTime - aTime;
    }).forEach(p => {
      const card = document.createElement('div');
      card.className = 'card';
      card.dataset.promptId = String(p.id);

      const title = document.createElement('div');
      title.className = 'title';
      title.textContent = p.title || 'Untitled';

      const preview = document.createElement('div');
      preview.className = 'preview';
      preview.textContent = p.content || '';

      // copy button for the prompt content
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'small-btn copy-btn';
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', async ()=>{
        try{
          const text = p.content || '';
          if(navigator.clipboard && navigator.clipboard.writeText){
            await navigator.clipboard.writeText(text);
          }else{
            // fallback
            const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
          }
          const cue = document.createElement('span'); cue.className='copy-cue'; cue.textContent='Copied';
          const copyWrap = copyBtn.closest && copyBtn.closest('.copy-wrap') ? copyBtn.closest('.copy-wrap') : copyBtn.parentNode;
          if(copyWrap){
            const existing = copyWrap.querySelector('.copy-cue'); if(existing) existing.remove();
            copyWrap.appendChild(cue);
            setTimeout(()=>{ cue.remove(); }, 1200);
          }
        }catch(err){
          console.error('Copy failed', err);
          alert('Unable to copy prompt to clipboard');
        }
      });

      const ratingEl = buildStars(p);

      const meta = document.createElement('div');
      meta.className = 'meta';

      // metadata display
      const mdEl = createMetadataElement(p.metadata || {});

      const del = document.createElement('button');
      del.className = 'small-btn delete';
      del.type = 'button';
      del.textContent = 'Delete';
      del.addEventListener('click', ()=>{
        deletePrompt(p.id);
      });
      meta.appendChild(mdEl);
      meta.appendChild(del);
      card.appendChild(title);
      const previewWrap = document.createElement('div'); previewWrap.className='preview-wrap';
      previewWrap.appendChild(preview);
      const copyWrap = document.createElement('div'); copyWrap.className = 'copy-wrap';
      copyWrap.appendChild(copyBtn);
      previewWrap.appendChild(copyWrap);
      card.appendChild(previewWrap);
      card.appendChild(ratingEl);

      // Notes UI
      const notesContainer = document.createElement('div');
      notesContainer.className = 'notes-area';
      notesContainer.dataset.promptId = String(p.id);
      renderNotesForPrompt(p, notesContainer);
      card.appendChild(notesContainer);

      card.appendChild(meta);

      container.appendChild(card);
    });
  }

  // Render notes area for a prompt
  function renderNotesForPrompt(prompt, container){
    container.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'notes-header';
    const h = document.createElement('h3');
    h.textContent = 'Notes';
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn note-add';
    addBtn.textContent = 'Add Note';
    header.appendChild(h);
    header.appendChild(addBtn);

    const list = document.createElement('ul');
    list.className = 'note-list';

    const notes = loadNotes(prompt.id || promptIdFrom(prompt));
    notes.forEach(n=>{
      const li = createNoteListItem(prompt.id, n);
      list.appendChild(li);
    });

    container.appendChild(header);
    container.appendChild(list);

    // Add new note flow
    addBtn.addEventListener('click', ()=>{
      const editorLi = document.createElement('li');
      editorLi.className = 'note-item note-editor';
      editorLi.innerHTML = `<div style="flex:1"><textarea placeholder=\"Write a quick note...\"></textarea></div>`;
      const actions = document.createElement('div');
      actions.className = 'note-meta';
      const save = document.createElement('button'); save.className='btn save'; save.textContent='Save';
      const cancel = document.createElement('button'); cancel.className='btn'; cancel.textContent='Cancel';
      actions.appendChild(save); actions.appendChild(cancel);
      editorLi.appendChild(actions);
      list.insertBefore(editorLi, list.firstChild);
      const ta = editorLi.querySelector('textarea'); ta.focus();

      cancel.addEventListener('click', ()=>{ editorLi.remove(); });
      save.addEventListener('click', ()=>{
        const val = ta.value.trim();
        if(!val){ alert('Note cannot be empty'); return; }
        const note = addNoteToPrompt(prompt.id, val);
        if(note){
          const newLi = createNoteListItem(prompt.id, note);
          editorLi.replaceWith(newLi);
        }else{
          alert('Failed to save note.');
        }
      });
    });
  }

  function promptIdFrom(p){ return p && p.id ? p.id : (p.dataset && p.dataset.promptId ? p.dataset.promptId : null); }

  function createNoteListItem(promptId, note){
    const li = document.createElement('li');
    li.className = 'note-item';
    li.dataset.noteId = note.id;

    const content = document.createElement('div');
    content.className = 'note-content';
    content.textContent = note.content;

    const meta = document.createElement('div');
    meta.className = 'note-meta';

    const actions = document.createElement('div'); actions.className='note-actions';
    const editBtn = document.createElement('button'); editBtn.className='btn'; editBtn.type='button'; editBtn.textContent='Edit';
    const delBtn = document.createElement('button'); delBtn.className='btn small-btn delete'; delBtn.type='button'; delBtn.textContent='Delete';
    const time = document.createElement('div'); time.className='time'; time.textContent = formatDateNoSeconds(new Date(note.updatedAt||note.createdAt));

    actions.appendChild(editBtn); actions.appendChild(delBtn);
    // stack time above actions so date occupies minimal width
    meta.appendChild(time); meta.appendChild(actions);

    li.appendChild(content); li.appendChild(meta);

    editBtn.addEventListener('click', ()=>{
      // replace content with textarea
      const editor = document.createElement('div'); editor.style.flex='1';
      editor.innerHTML = `<textarea>${escapeHtml(note.content)}</textarea>`;
      const save = document.createElement('button'); save.className='btn save'; save.textContent='Save';
      const cancel = document.createElement('button'); cancel.className='btn'; cancel.textContent='Cancel';
      const actionWrap = document.createElement('div'); actionWrap.className='note-meta'; actionWrap.appendChild(save); actionWrap.appendChild(cancel);
      li.innerHTML = ''; li.appendChild(editor); li.appendChild(actionWrap);
      const ta = li.querySelector('textarea'); ta.focus();

      cancel.addEventListener('click', ()=>{ renderNotesForPrompt({id:promptId}, li.closest('.notes-area')); });
      save.addEventListener('click', ()=>{
        const val = ta.value.trim();
        if(!val){ alert('Note cannot be empty'); return; }
        const ok = editNote(promptId, note.id, val);
        if(ok){
          // show tiny save cue
          const confirm = document.createElement('span'); confirm.className='save-confirm show'; confirm.textContent='✓ Saved';
          li.appendChild(confirm);
          setTimeout(()=>{ confirm.classList.remove('show'); confirm.remove(); }, 900);
          renderNotesForPrompt({id:promptId}, li.closest('.notes-area'));
        }else{ alert('Failed to save note'); }
      });
    });

    delBtn.addEventListener('click', ()=>{
      if(!confirm('Delete this note?')) return;
      const ok = deleteNote(promptId, note.id);
      if(ok){ renderNotesForPrompt({id:promptId}, li.closest('.notes-area')); }
      else alert('Failed to delete note');
    });

    return li;
  }

  function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function addPrompt(title, content, modelName, isCode){
    try{
      const prompts = loadPrompts();
      const item = { id: Date.now(), title: String(title||'').trim(), content: String(content||'').trim(), ratingSummary: { average:0, count:0, userRatings: {} } };
      // attach metadata (trackModel will validate inputs)
      item.metadata = trackModel(String(modelName||item.title||'').trim(), item.content);
      // allow caller to force isCode by overriding token estimate if requested
      if(typeof isCode === 'boolean' && item.metadata && item.metadata.tokenEstimate){
        item.metadata.tokenEstimate = estimateTokens(item.content, isCode);
      }
      prompts.push(item);
      savePrompts(prompts);
      renderPrompts();
      return item;
    }catch(err){
      console.error('addPrompt error', err);
      throw err;
    }
  }

  function deletePrompt(id){
    const prompts = loadPrompts().filter(p => p.id !== id);
    savePrompts(prompts);
    renderPrompts();
  }

  function onFormSubmit(e){
    e.preventDefault();
    const title = qs('#title').value || '';
    const content = qs('#content').value || '';
    const model = qs('#model') ? qs('#model').value : '';
    const isCode = qs('#isCode') ? Boolean(qs('#isCode').checked) : false;
    if(!title.trim() || !content.trim() || !model.trim()){
      alert('Please provide a title, model name, and prompt content.');
      return;
    }
    try{
      addPrompt(title, content, model, isCode);
      qs('#prompt-form').reset();
      qs('#title').focus();
    }catch(err){
      console.error(err);
      alert('Failed to save prompt: ' + (err && err.message ? err.message : String(err)));
    }
  }

  // --- Export / Import implementation ---
  const EXPORT_VERSION = '1.0';

  function computeStats(prompts){
    const total = Array.isArray(prompts) ? prompts.length : 0;
    // average rating across prompts that have ratingSummary.average
    const ratings = (prompts||[]).map(p=> (p && p.ratingSummary && typeof p.ratingSummary.average === 'number') ? p.ratingSummary.average : null).filter(v=>v!==null);
    const averageRating = ratings.length ? Math.round((ratings.reduce((s,v)=>s+v,0)/ratings.length) * 10)/10 : 0;
    // most used model
    const modelCount = {};
    (prompts||[]).forEach(p=>{ const m = p && p.metadata && p.metadata.model ? String(p.metadata.model) : ''; if(m) modelCount[m] = (modelCount[m]||0)+1; });
    let mostUsedModel = null; let max = 0;
    Object.keys(modelCount).forEach(k=>{ if(modelCount[k] > max){ max = modelCount[k]; mostUsedModel = k; } });
    return { totalPrompts: total, averageRating, mostUsedModel };
  }

  function validateExportData(obj){
    if(!obj || typeof obj !== 'object') throw new Error('Invalid export: root is not an object');
    if(!obj.version) throw new Error('Missing version in export');
    if(!obj.exportedAt || !isValidISODateString(obj.exportedAt)) throw new Error('Invalid or missing exportedAt timestamp');
    if(!Array.isArray(obj.prompts)) throw new Error('Invalid or missing prompts array');
    return true;
  }

  function exportPromptsToFile(){
    try{
      const prompts = loadPrompts();
      const stats = computeStats(prompts);
      const payload = { version: EXPORT_VERSION, exportedAt: new Date().toISOString(), stats, prompts };
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const ts = new Date().toISOString().replace(/[:.]/g,'-');
      a.download = `prompts-export-${ts}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=>{ URL.revokeObjectURL(a.href); }, 5000);
    }catch(err){
      console.error('Export failed', err);
      alert('Export failed: ' + (err && err.message ? err.message : String(err)));
    }
  }

  function backupPrompts(){
    try{
      const raw = localStorage.getItem(KEY) || '[]';
      const bkKey = KEY + '.backup.' + new Date().toISOString();
      localStorage.setItem(bkKey, raw);
      return bkKey;
    }catch(e){
      console.error('Backup failed', e);
      return null;
    }
  }

  function restoreBackup(bkKey){
    try{
      const raw = localStorage.getItem(bkKey);
      if(raw == null) return false;
      localStorage.setItem(KEY, raw);
      return true;
    }catch(e){
      console.error('Restore backup failed', e);
      return false;
    }
  }

  function mergePrompts(existing, incoming, mode){
    const map = {};
    (existing||[]).forEach(p=>{ map[String(p.id)] = p; });
    (incoming||[]).forEach(p=>{
      let id = p && p.id ? String(p.id) : null;
      if(!id){ id = 'imp-' + Math.random().toString(36).slice(2,10); p.id = id; }
      if(map[id]){
        if(mode === 'replace'){
          map[id] = p;
        } else if(mode === 'merge'){
          // keep existing, but fill missing fields from incoming
          const existingObj = map[id];
          const merged = Object.assign({}, p, existingObj);
          // prefer existing metadata but ensure metadata fields are present
          merged.metadata = Object.assign({}, p.metadata || {}, existingObj.metadata || {});
          merged.ratingSummary = Object.assign({}, p.ratingSummary || {}, existingObj.ratingSummary || {});
          map[id] = merged;
        }
      }else{
        map[id] = p;
      }
    });
    return Object.values(map);
  }

  function handleImportFile(file){
    const reader = new FileReader();
    reader.onload = function(ev){
      try{
        const txt = String(ev.target.result || '');
        const obj = JSON.parse(txt);
        // basic validation
        validateExportData(obj);
        const incoming = obj.prompts || [];
        const existing = loadPrompts();
        const existingIds = new Set((existing||[]).map(p=>String(p.id)));
        let duplicateCount = 0;
        incoming.forEach(p=>{ if(p && p.id && existingIds.has(String(p.id))) duplicateCount++; });

        let mode = 'merge';
        if(duplicateCount > 0){
          const answer = prompt(`Import file contains ${duplicateCount} prompts with IDs that already exist. Type 'replace' to overwrite existing prompts, or 'merge' to keep existing and add non-duplicates.`, 'merge');
          if(!answer) return; // user cancelled
          const a = String(answer||'').trim().toLowerCase();
          if(a === 'replace') mode = 'replace'; else mode = 'merge';
        } else {
          // no duplicates; still ask whether to append or replace all
          const ans = confirm('No duplicate IDs detected. Click OK to append imported prompts to existing prompts, or Cancel to replace your existing prompts with the imported set.');
          mode = ans ? 'merge' : 'replace';
        }

        // backup current data
        const bkKey = backupPrompts();
        try{
          const merged = mergePrompts(existing, incoming, mode);
          savePrompts(merged);
          renderPrompts();
          alert(`Import successful. ${incoming.length} prompts processed. Mode: ${mode}`);
        }catch(innerErr){
          // rollback
          if(bkKey) restoreBackup(bkKey);
          console.error('Import failed, rolled back', innerErr);
          alert('Import failed: ' + (innerErr && innerErr.message ? innerErr.message : String(innerErr)));
        }
      }catch(err){
        console.error('Failed to read import file', err);
        alert('Import failed: ' + (err && err.message ? err.message : String(err)));
      }
    };
    reader.onerror = function(ev){
      console.error('File read error', ev);
      alert('Failed to read file');
    };
    reader.readAsText(file, 'utf-8');
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    const form = qs('#prompt-form');
    form.addEventListener('submit', onFormSubmit);
    renderPrompts();

    const exp = qs('#export-btn');
    if(exp) exp.addEventListener('click', exportPromptsToFile);
    const fileInput = qs('#import-file');
    if(fileInput) fileInput.addEventListener('change', (e)=>{ const f = e.target.files && e.target.files[0]; if(f) handleImportFile(f); e.target.value = ''; });
  });

})();
