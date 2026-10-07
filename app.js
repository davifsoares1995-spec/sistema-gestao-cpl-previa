(() => {
  const base = window.FLEET_PREVIEW_DATA;
  const STORAGE_KEY = 'cpl-fleet-preview-functional-v5';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const machineKinds = new Set(['Retroescavadeira','Escavadeira']);
  const defaultAlertSettings = {collaborator:'Responsável pela frota',hoursThreshold:50,kmThreshold:5000};
  const clone = value => JSON.parse(JSON.stringify(value));
  const isoToday = () => new Date().toISOString().slice(0,10);
  const dateValue = value => {
    if(!value)return null;
    const raw=String(value).trim();
    const short=raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if(short){const year=short[3].length===2?2000+Number(short[3]):Number(short[3]);return new Date(year,Number(short[1])-1,Number(short[2]));}
    const parsed=new Date(`${raw.slice(0,10)}T12:00:00`);
    return Number.isNaN(parsed.getTime())?null:parsed;
  };
  const formatDate = value => {
    if (!value) return '—';
    const date=dateValue(value);
    return date?date.toLocaleDateString('pt-BR'):String(value);
  };
  const formatReading = value => Number(value || 0).toLocaleString('pt-BR', {maximumFractionDigits: 2});
  const parseReading = value => {
    const text = String(value ?? '').trim();
    if (!text || text === '—') return 0;
    return Number(text.replace(/[.,]/g,'')) || 0;
  };
  const planKey = row => `${row.code}|${row.description}`;

  function initialPlanState(item, currentReading){
    const result = {};
    item.plan.filter(row => !row.group).forEach((row,index) => {
      const values = item.unit === 'h' ? [250,500,1000,2000] : [5000,10000,15000,20000];
      const interval = values[index % values.length];
      const factor = index === 0 ? 1.2 : index === 6 ? .9 : .3 + (index % 4) * .08;
      result[planKey(row)] = {interval,lastReading:Math.max(0,Math.round(currentReading-interval*factor)),lastDate:''};
    });
    return result;
  }
  function initialDocuments(item){
    const docs = [];
    if (item.kind === 'Ônibus') docs.push({id:`doc-${item.id}-1`,type:'Tacógrafo',number:'Laudo da planilha',issuedAt:'2026-01-15',dueAt:'2026-11-30',provider:'Responsável não informado'});
    if (item.identifier === 'ESC 03') docs.push({id:`doc-${item.id}-1`,type:'Opacímetro',number:'Controle da planilha',issuedAt:'2025-12-01',dueAt:'2026-12-31',provider:'Responsável não informado'});
    return docs;
  }
  function createState(){
    const demoLessor={id:'lessor-demo',companyName:'Locadora responsável (exemplo)',tradeName:'Locadora Exemplo',cnpj:'00.000.000/0000-00',contactName:'Atendimento de manutenção',phone:'(00) 0000-0000',email:'manutencao@exemplo.com',address:'Endereço cadastrado da locadora',notes:'Cadastro demonstrativo da prévia.'};
    return {lastImportAt:null,alertSettings:{...defaultAlertSettings},lessors:[demoLessor],equipment:clone(base.equipment).map(item => {
      const unit=machineKinds.has(item.kind)?'h':'km';
      const currentReading = unit==='h' ? parseReading(item.readings.hours) : parseReading(item.readings.km);
      const rentalDemo=item.identifier==='268540';
      const prepared={...item,unit,currentReading,petran:rentalDemo?'PTR268540':'',ownership:rentalDemo?'rented':'owned',nextRevisionReading:rentalDemo?currentReading+100:null,lessorId:rentalDemo?'lessor-demo':'',contractNumber:rentalDemo?'Contrato de demonstração':'',invoiceNumber:rentalDemo?'NF de demonstração':'',invoiceDate:rentalDemo?'2026-09-20':'',arrivalDate:rentalDemo?'2026-09-22':'',arrivalReading:rentalDemo?0:null,rentalDemo,responsible:'',notes:'',historyRecords:item.dates.map((date,index)=>({id:`hist-${item.id}-${index}`,date,type:index===0?'Preventiva':'Inspeção',service:index===0?'Revisão preventiva importada':'Inspeção e serviços do ciclo',reading:null,provider:'Importado da planilha',notes:'Registro identificado na aba de origem.'})),documents:initialDocuments(item)};
      prepared.planState=initialPlanState(prepared,currentReading);
      return prepared;
    })};
  }
  function loadState(){
    try { const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)); if(saved?.equipment?.length)return {...saved,alertSettings:{...defaultAlertSettings,...saved.alertSettings}}; } catch (_) {}
    return createState();
  }
  let state=loadState();
  let selectedId=state.equipment.find(item=>item.identifier==='268540')?.id||state.equipment[0]?.id;
  let filter='all',tab='plan',toastTimer;

  const save=()=>localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
  const current=()=>state.equipment.find(item=>item.id===selectedId)||state.equipment[0];
  const lessorFor=item=>state.lessors.find(lessor=>lessor.id===item.lessorId)||null;
  const isMachine=item=>machineKinds.has(item.kind)||item.unit==='h';
  const readingLabel=(item,value=item.currentReading)=>`${formatReading(value)} ${item.unit||(isMachine(item)?'h':'km')}`;
  const threshold=item=>item.unit==='h'?Number(state.alertSettings.hoursThreshold):Number(state.alertSettings.kmThreshold);
  function planStatus(item,row,reading=item.currentReading){
    if(row.group)return {state:'group',remaining:null,next:null};
    const detail=item.planState[planKey(row)]||{interval:item.unit==='h'?250:10000,lastReading:reading};
    const next=Number(detail.lastReading||0)+Number(detail.interval||0),remaining=next-reading;
    return {state:remaining<=0?'overdue':remaining<=threshold(item)?'upcoming':'ok',remaining,next,...detail};
  }
  function documentStatus(doc){
    const days=Math.ceil((new Date(`${doc.dueAt}T12:00:00`)-new Date(`${isoToday()}T12:00:00`))/86400000);
    return {days,state:days<0?'overdue':days<=60?'soon':'ok'};
  }
  function rentalStatus(item,reading=item.currentReading){
    const next=Number(item.nextRevisionReading||0),remaining=next-reading,limit=threshold(item);
    return {next,remaining,state:remaining<=0?'overdue':remaining<=limit?'upcoming':'ok'};
  }
  function alertsFor(item,reading=item.currentReading){
    if(item.ownership==='rented')return rentalStatus(item,reading).state==='ok'?0:1;
    return item.plan.filter(row=>!row.group&&planStatus(item,row,reading).state!=='ok').length+item.documents.filter(doc=>documentStatus(doc).state!=='ok').length;
  }
  function showToast(message,tone='success'){
    clearTimeout(toastTimer);const toast=$('toast');toast.textContent=message;toast.className=`toast show ${tone}`;toastTimer=setTimeout(()=>toast.className='toast',2800);
  }
  const openDialog=id=>$(id).showModal();
  const closeDialog=id=>$(id).close();

  function renderKpis(){
    $('equipmentTotal').textContent=state.equipment.length;
    $('sheetTotal').textContent=base.sheetCount;
    $('historyTotal').textContent=state.equipment.filter(item=>item.historyRecords.length).length;
    $('planTotal').textContent=state.equipment.reduce((sum,item)=>sum+item.plan.filter(row=>!row.group).length,0).toLocaleString('pt-BR');
    $('topAlertCount').textContent=state.equipment.reduce((sum,item)=>sum+alertsFor(item),0);
    $('alertRulesText').textContent=`${state.alertSettings.collaborator}: avisar com ${formatReading(state.alertSettings.hoursThreshold)} h ou ${formatReading(state.alertSettings.kmThreshold)} km de antecedência.`;
  }
  function visibleEquipment(){
    const query=$('searchInput').value.trim().toLowerCase();
    return state.equipment.filter(item=>{const machine=isMachine(item),typeOk=filter==='all'||(filter==='machine'?machine:!machine),text=[item.identifier,item.petran,item.kind,item.equipment,item.manufacturer,item.model,...item.sourceSheets].join(' ').toLowerCase();return typeOk&&(!query||text.includes(query));});
  }
  function renderList(){
    const rows=visibleEquipment();$('equipmentFound').textContent=`${rows.length} encontrado${rows.length===1?'':'s'}`;
    $('equipmentList').innerHTML=rows.map(item=>{const machine=isMachine(item),alerts=alertsFor(item),rented=item.ownership==='rented',rental=rented?rentalStatus(item):null,status=rented?(rental.state==='overdue'?'Revisão vencida':rental.state==='upcoming'?`Faltam ${formatReading(rental.remaining)} ${item.unit}`:'Locadora · em dia'):(alerts?`${alerts} alerta${alerts===1?'':'s'}`:'Em dia'),subtitle=[item.model||item.equipment,item.petran&&`PETRAN ${item.petran}`].filter(Boolean).join(' · ');return `<button class="equipment-card ${machine?'machine':''} ${item.id===selectedId?'selected':''}" data-equipment="${item.id}"><span class="icon">${machine?'H':'KM'}</span><span><small>${esc(item.kind)}${rented?' · ALUGADO':''}</small><strong>${esc(item.identifier)}</strong><em>${esc(subtitle)}</em></span><span><b>${esc(readingLabel(item))}</b><i class="${alerts?'attention':''} ${rented?'rental-label':''}">${esc(status)}</i></span></button>`;}).join('')||'<div class="empty-state"><div><h3>Nenhum equipamento encontrado</h3><p>Ajuste a busca ou o filtro.</p></div></div>';
    document.querySelectorAll('[data-equipment]').forEach(button=>button.onclick=()=>{selectedId=button.dataset.equipment;render();});
  }
  function renderSummary(){
    const item=current(),alerts=alertsFor(item),rented=item.ownership==='rented',rental=rented?rentalStatus(item):null;
    $('summary').innerHTML=`<div><small>${rented?'EQUIPAMENTO ALUGADO':esc(item.kind.toUpperCase())}</small><h3>${esc(item.identifier)}</h3><p>${esc([item.manufacturer,item.model,item.year&&!String(item.year).includes(':')?item.year:'',item.petran&&`PETRAN ${item.petran}`].filter(Boolean).join(' · ')||item.equipment)}</p><span class="source-chip">${item.sourceTabCount} aba${item.sourceTabCount===1?'':'s'} de origem</span>${item.rentalDemo?'<span class="source-chip rental-banner">Exemplo da prévia</span>':''}</div><div><small>LEITURA ATUAL</small><strong>${esc(readingLabel(item))}</strong><p>${isMachine(item)?'Controle por horímetro':'Controle por quilometragem'}</p></div><div><small>${rented?'PRÓXIMA REVISÃO DA LOCADORA':'ACOMPANHAMENTO'}</small><strong>${rented?esc(readingLabel(item,rental.next)):(alerts?`${alerts} alerta${alerts===1?'':'s'}`:'Tudo em dia')}</strong><p>${rented?(rental.remaining<=0?`${formatReading(Math.abs(rental.remaining))} ${item.unit} além do limite`:`Faltam ${formatReading(rental.remaining)} ${item.unit}`):`${item.historyRecords.length} registro(s) no histórico`}</p></div>`;
    const planButton=document.querySelector('[data-tab="plan"]');planButton.innerHTML=rented?'Controle da locadora <b>1</b>':`Plano preventivo <b>${item.plan.filter(row=>!row.group).length}</b>`;
    $('vehicleQrBtn').href=`qr-motorista.html?equipamento=${encodeURIComponent(item.identifier)}`;
    $('vehicleQrBtn').title=`Gerar QR Code exclusivo para ${item.identifier}`;
    $('registerMaintenanceBtn').textContent=rented?'Registrar revisão da locadora':'＋ Registrar manutenção';
  }
  function renderPlan(item){
    const rows=item.plan.slice(0,45);
    return `<div class="table-title"><div><h3>Plano preventivo detalhado</h3><p>Atualize a leitura ou conclua um serviço para ver os próximos ciclos.</p></div><span class="legend">${item.plan.filter(row=>!row.group).length} serviços rastreáveis</span></div><div class="plan-table"><div class="plan-head"><span>Código</span><span>Sistema ou serviço</span><span>Ação prevista</span><span>Próxima</span><span>Restante</span><span>Ação</span></div>${rows.map(row=>{const status=planStatus(item,row);if(row.group)return `<div class="plan-row group"><b>${esc(row.code)}</b><strong>${esc(row.description)}</strong><span></span><span></span><span></span><span></span></div>`;const action=row.actions[0]||'Conforme ciclo',remainingText=status.remaining<=0?`${formatReading(Math.abs(status.remaining))} vencido`:formatReading(status.remaining),cls=status.state==='overdue'?'due':status.state==='upcoming'?'soon':'';return `<div class="plan-row"><b>${esc(row.code)}</b><strong>${esc(row.description)}</strong><span class="actions"><i class="action-tag ${/TROC|SUBSTIT/.test(action.toUpperCase())?'change':'inspect'}">${esc(action)}</i></span><span class="reading-cell">${formatReading(status.next)} ${item.unit}</span><span class="remaining ${cls}">${remainingText} ${item.unit}</span><button class="complete-btn" data-complete="${esc(planKey(row))}">✓ Concluir</button></div>`;}).join('')}</div>`;
  }
  function renderRentalPlan(item){
    const status=rentalStatus(item),lessor=lessorFor(item),label=status.state==='overdue'?'Revisão vencida':status.state==='upcoming'?'Revisão próxima':'Em dia';
    return `<div class="rental-control"><div><small>CONTROLE SIMPLIFICADO · ALUGADO</small><h3>Manutenção sob responsabilidade da locadora</h3><p>O sistema acompanha a leitura atual e o próximo limite informado.</p></div><div><small>LEITURA ATUAL</small><strong>${esc(readingLabel(item))}</strong></div><div><small>PRÓXIMA REVISÃO</small><strong>${esc(readingLabel(item,status.next))}</strong></div><em class="${status.state}">${label}</em></div><div class="rental-details"><article><small>RESTANTE</small><strong>${status.remaining<=0?`${formatReading(Math.abs(status.remaining))} ${item.unit} além do limite`:`${formatReading(status.remaining)} ${item.unit}`}</strong></article><article><small>LOCADORA</small><strong>${esc(lessor?.companyName||'Não informada')}</strong></article><article><small>CONTRATO</small><strong>${esc(item.contractNumber||'Não informado')}</strong></article></div><div class="arrival-grid"><article><small>DATA DE CHEGADA</small><strong>${esc(formatDate(item.arrivalDate))}</strong></article><article><small>LEITURA NA CHEGADA</small><strong>${item.arrivalReading==null?'Não informada':esc(readingLabel(item,item.arrivalReading))}</strong></article><article><small>NOTA FISCAL</small><strong>${esc(item.invoiceNumber||'Não informada')}</strong></article><article><small>DATA DA NOTA</small><strong>${esc(formatDate(item.invoiceDate))}</strong></article></div><div class="lessor-contact-card"><div><small>RAZÃO SOCIAL / CNPJ</small><strong>${esc([lessor?.companyName,lessor?.cnpj].filter(Boolean).join(' · ')||'Locadora não cadastrada')}</strong></div><div><small>CONTATO</small><strong>${esc([lessor?.contactName,lessor?.phone].filter(Boolean).join(' · ')||'Não informado')}</strong></div><div><small>E-MAIL</small><strong>${esc(lessor?.email||'Não informado')}</strong></div></div><div class="rental-note" style="margin-top:10px"><span>i</span><div><strong>O que a equipe precisa atualizar</strong><small>Registre o KM ou horímetro do painel. Depois que a locadora fizer a manutenção, informe somente o novo KM ou hora da próxima manutenção.</small></div></div>`;
  }
  function renderHistory(item){
    if(!item.historyRecords.length)return `<div class="empty-state"><div><span>▤</span><h3>Nenhum histórico registrado</h3><p>Use “Registrar manutenção” ou conclua um item do plano para criar a primeira entrada.</p></div></div>`;
    const records=[...item.historyRecords].sort((a,b)=>(dateValue(b.date)?.getTime()||0)-(dateValue(a.date)?.getTime()||0));
    return `<div class="table-title"><div><h3>Histórico do equipamento</h3><p>Leituras, serviços e inspeções ficam reunidos nesta linha do tempo.</p></div></div><div class="history-list">${records.map(record=>`<article class="history-card"><span>${record.type==='Leitura'?'▰':'✓'}</span><div><small>DATA</small><strong>${esc(formatDate(record.date))}</strong></div><div><strong>${esc(record.service)}</strong><p>${[record.type,record.reading!=null?readingLabel(item,record.reading):'',record.provider,record.parts,record.notes].filter(Boolean).map(esc).join(' · ')}</p></div><em>${esc(record.type)}</em></article>`).join('')}</div>`;
  }
  function renderDocuments(item){
    return `<div class="documents-head"><div><h3>Documentos e vencimentos</h3><p>Laudos, licenças e controles vinculados ao equipamento.</p></div><button id="addDocumentBtn">＋ Adicionar documento</button></div>${item.documents.length?`<div class="document-list">${item.documents.map(doc=>{const status=documentStatus(doc),label=status.state==='overdue'?'Vencido':status.state==='soon'?'Próximo':'Em dia';return `<article class="document-card"><span>▤</span><div><strong>${esc(doc.type)}</strong><small>${esc([doc.number,doc.provider].filter(Boolean).join(' · '))}</small></div><time>Vence ${esc(formatDate(doc.dueAt))}</time><em class="${status.state}">${label}</em></article>`;}).join('')}</div>`:`<div class="empty-state"><div><span>▤</span><h3>Nenhum documento cadastrado</h3><p>Adicione tacógrafo, opacímetro, seguro, licenciamento ou outro documento.</p></div></div>`}`;
  }
  function renderSources(item){
    return `<div class="table-title"><div><h3>Origem e consolidação</h3><p>Todas as abas continuam rastreáveis após a importação.</p></div></div><div class="source-grid">${item.sourceSheets.map((sheet,index)=>`<article class="source-card ${item.sourceTabCount>1?'duplicate':''}"><small>ABA ${index+1}${item.sourceTabCount>1?' · CONSOLIDADA':''}</small><strong>${esc(sheet)}</strong><span>${esc(item.variants.find(v=>v.sheetName===sheet)?.sourceRange||'')} · ${item.variants.find(v=>v.sheetName===sheet)?.planCount||0} linhas de plano</span></article>`).join('')}</div><div class="mapping-box"><h4>Como os dados entram no sistema</h4><ul><li>Placa ou série → identificação do equipamento</li><li>KM ou horas → leitura atual e histórico de leituras</li><li>Sistemas e atividades → plano preventivo detalhado</li><li>Datas de revisão → histórico de manutenção</li><li>Fabricante, modelo e ano → cadastro do equipamento</li><li>Tacógrafo e opacímetro → documentos com vencimento</li></ul></div>`;
  }
  function renderDetail(){
    const item=current();renderSummary();$('detailContent').innerHTML=tab==='history'?renderHistory(item):tab==='documents'?renderDocuments(item):tab==='sources'?renderSources(item):item.ownership==='rented'?renderRentalPlan(item):renderPlan(item);
    document.querySelectorAll('[data-tab]').forEach(button=>button.classList.toggle('active',button.dataset.tab===tab));
    document.querySelectorAll('[data-complete]').forEach(button=>button.onclick=()=>openMaintenance(button.dataset.complete));
    if($('addDocumentBtn'))$('addDocumentBtn').onclick=()=>{$('documentForm').reset();openDialog('documentDialog');};
  }
  function render(){renderKpis();renderList();renderDetail();}

  function fillEquipmentForm(item=null){
    const form=$('equipmentForm');form.reset();form.elements.id.value=item?.id||'';$('equipmentDialogTitle').textContent=item?'Editar equipamento':'Novo equipamento';renderLessorOptions(item?.lessorId||'');
    if(item){for(const field of ['identifier','petran','kind','manufacturer','model','year','responsible','notes','contractNumber','invoiceNumber','invoiceDate','arrivalDate','arrivalReading'])if(form.elements[field])form.elements[field].value=item[field]??'';form.elements.unit.value=item.unit||'km';form.elements.ownership.value=item.ownership||'owned';form.elements.currentReading.value=item.currentReading||0;form.elements.nextRevisionReading.value=item.nextRevisionReading||'';form.elements.lessorId.value=item.lessorId||'';}
    syncOwnershipFields();
  }
  function renderLessorOptions(selected=''){
    const select=$('equipmentForm').elements.lessorId;select.innerHTML=`<option value="">Selecione a locadora</option>${state.lessors.map(lessor=>`<option value="${esc(lessor.id)}">${esc(lessor.tradeName||lessor.companyName)}</option>`).join('')}`;select.value=selected;
  }
  function syncOwnershipFields(){
    const form=$('equipmentForm'),rented=form.elements.ownership.value==='rented';
    document.querySelectorAll('.rental-field').forEach(field=>field.hidden=!rented);
    form.elements.nextRevisionReading.required=rented;
  }
  function openReading(){
    const item=current(),form=$('readingForm');form.reset();form.elements.reading.value=item.currentReading;form.elements.reading.min=item.currentReading;form.elements.date.value=isoToday();$('readingUnit').textContent=item.unit;$('readingEquipment').innerHTML=`<small>${esc(item.kind)}</small><strong>${esc(item.identifier)}</strong><span>Leitura atual: ${esc(readingLabel(item))}</span>`;updateReadingImpact();openDialog('readingDialog');
  }
  function updateReadingImpact(){
    const item=current(),value=Number($('readingForm').elements.reading.value),box=$('readingImpact');
    if(!Number.isFinite(value)||value<item.currentReading){box.className='impact-box danger';box.textContent='A nova leitura não pode ser menor que a leitura atual.';return;}
    if(item.ownership==='rented'){const rental=rentalStatus(item,value);box.className=`impact-box ${rental.state==='overdue'?'danger':rental.state==='upcoming'?'warning':''}`;box.textContent=rental.remaining<=0?`A revisão da locadora está ${formatReading(Math.abs(rental.remaining))} ${item.unit} além do limite.`:`Após atualizar, faltarão ${formatReading(rental.remaining)} ${item.unit} para a revisão da locadora.`;return;}
    const overdue=item.plan.filter(row=>!row.group&&planStatus(item,row,value).state==='overdue').length,upcoming=item.plan.filter(row=>!row.group&&planStatus(item,row,value).state==='upcoming').length;
    box.className=`impact-box ${overdue?'danger':upcoming?'warning':''}`;box.textContent=overdue?`${overdue} serviço(s) ficarão vencidos e ${upcoming} próximo(s) do limite.`:upcoming?`${upcoming} serviço(s) ficarão próximos do limite.`:'Nenhum serviço ficará vencido com esta leitura.';
  }
  function openMaintenance(key=''){
    const item=current(),form=$('maintenanceForm');form.reset();form.elements.planKey.value=key;form.elements.date.value=isoToday();form.elements.reading.value=item.currentReading;const row=item.plan.find(plan=>planKey(plan)===key);form.elements.service.value=row?.description||'';$('maintenanceEquipment').innerHTML=`<small>${esc(item.kind)}</small><strong>${esc(item.identifier)}</strong><span>Leitura atual: ${esc(readingLabel(item))}</span>`;openDialog('maintenanceDialog');
  }
  function openRentalRevision(){
    const item=current(),form=$('rentalRevisionForm');form.reset();form.elements.date.value=isoToday();form.elements.nextRevisionReading.value=item.nextRevisionReading||'';$('rentalRevisionEquipment').innerHTML=`<small>${esc(item.kind)} · ALUGADO</small><strong>${esc(item.identifier)}</strong><span>Atual: ${esc(readingLabel(item))} · Próxima manutenção cadastrada: ${esc(readingLabel(item,item.nextRevisionReading))}</span>`;openDialog('rentalRevisionDialog');
  }
  function renderLessors(){
    $('lessorsList').innerHTML=state.lessors.map(lessor=>{const linked=state.equipment.filter(item=>item.lessorId===lessor.id).length;return `<article class="lessor-card"><span>▣</span><div><small>${esc(lessor.tradeName||'LOCADORA')}</small><strong>${esc(lessor.companyName)}</strong><em>${esc(lessor.cnpj||'CNPJ não informado')}</em></div><div><small>CONTATO</small><strong>${esc(lessor.contactName||'Não informado')}</strong><em>${esc([lessor.phone,lessor.email].filter(Boolean).join(' · ')||'Telefone e e-mail não informados')}</em></div><button type="button" data-edit-lessor="${esc(lessor.id)}">Editar · ${linked} equipamento${linked===1?'':'s'}</button></article>`;}).join('')||'<div class="empty-state"><div><h3>Nenhuma locadora cadastrada</h3><p>Cadastre a primeira empresa para vinculá-la aos equipamentos alugados.</p></div></div>';
    document.querySelectorAll('[data-edit-lessor]').forEach(button=>button.onclick=()=>openLessorEditor(button.dataset.editLessor));
  }
  function openLessorEditor(id=''){
    const lessor=state.lessors.find(item=>item.id===id),form=$('lessorForm');form.reset();form.elements.id.value=lessor?.id||'';$('lessorDialogTitle').textContent=lessor?'Editar locadora':'Nova locadora';
    if(lessor)for(const field of ['companyName','tradeName','cnpj','contactName','phone','email','address','notes'])form.elements[field].value=lessor[field]||'';
    openDialog('lessorEditorDialog');
  }
  function openAlertSettings(){
    const form=$('alertSettingsForm'),settings=state.alertSettings;
    form.elements.collaborator.value=settings.collaborator;
    form.elements.hoursThreshold.value=settings.hoursThreshold;
    form.elements.kmThreshold.value=settings.kmThreshold;
    openDialog('alertSettingsDialog');
  }

  $('equipmentForm').onsubmit=event=>{
    event.preventDefault();const form=event.currentTarget,id=form.elements.id.value,existing=state.equipment.find(item=>item.id===id),unit=form.elements.unit.value,currentReading=Number(form.elements.currentReading.value),ownership=form.elements.ownership.value,nextRevisionReading=ownership==='rented'?Number(form.elements.nextRevisionReading.value):null,values={identifier:form.elements.identifier.value.trim().toUpperCase(),petran:form.elements.petran.value.trim().toUpperCase(),kind:form.elements.kind.value,equipment:form.elements.kind.value,manufacturer:form.elements.manufacturer.value.trim(),model:form.elements.model.value.trim(),year:form.elements.year.value,responsible:form.elements.responsible.value.trim(),notes:form.elements.notes.value.trim(),unit,currentReading,ownership,nextRevisionReading,lessorId:ownership==='rented'?form.elements.lessorId.value:'',contractNumber:form.elements.contractNumber.value.trim(),invoiceNumber:form.elements.invoiceNumber.value.trim(),invoiceDate:form.elements.invoiceDate.value,arrivalDate:form.elements.arrivalDate.value,arrivalReading:form.elements.arrivalReading.value===''?null:Number(form.elements.arrivalReading.value)};
    if(existing){Object.assign(existing,values);showToast('Cadastro atualizado na prévia.');}
    else{const newItem={id:`custom-${Date.now()}`,...values,readings:{km:'',hours:''},sourceSheets:['Cadastro manual na prévia'],sourceTabCount:1,variants:[{sheetName:'Cadastro manual na prévia',sourceRange:'—',planCount:3}],dates:[],hasHistory:false,historyRecords:[],documents:[],plan:[{code:'1',description:'MOTOR',group:true,actions:[]},{code:'1.1',description:'Óleo do motor e filtros',group:false,actions:['TROCAR']},{code:'2',description:'FREIOS',group:true,actions:[]},{code:'2.1',description:'Sistema de freio',group:false,actions:['VERIFICAR']},{code:'3',description:'PNEUS E SUSPENSÃO',group:true,actions:[]},{code:'3.1',description:'Pneus, rodas e suspensão',group:false,actions:['VERIFICAR']}],planCount:3,sectionCount:3};newItem.planState=initialPlanState(newItem,currentReading);state.equipment.unshift(newItem);selectedId=newItem.id;showToast('Equipamento criado na prévia.');}
    save();closeDialog('equipmentDialog');render();
  };
  $('readingForm').onsubmit=event=>{event.preventDefault();const item=current(),form=event.currentTarget,value=Number(form.elements.reading.value);if(value<item.currentReading){updateReadingImpact();return;}item.currentReading=value;item.historyRecords.push({id:`hist-${Date.now()}`,date:form.elements.date.value,type:'Leitura',service:'Atualização de leitura',reading:value,provider:'Atualização manual',notes:form.elements.notes.value.trim()});save();closeDialog('readingDialog');render();showToast('Leitura atualizada e planos recalculados.');};
  $('maintenanceForm').onsubmit=event=>{event.preventDefault();const item=current(),form=event.currentTarget,reading=Number(form.elements.reading.value),key=form.elements.planKey.value;if(reading>item.currentReading)item.currentReading=reading;item.historyRecords.push({id:`hist-${Date.now()}`,date:form.elements.date.value,type:form.elements.type.value,service:form.elements.service.value.trim(),reading,provider:form.elements.provider.value.trim(),document:form.elements.document.value.trim(),parts:form.elements.parts.value.trim(),notes:form.elements.notes.value.trim()});if(key&&item.planState[key]){item.planState[key].lastReading=reading;item.planState[key].lastDate=form.elements.date.value;}save();closeDialog('maintenanceDialog');tab='history';render();showToast('Manutenção registrada e próximo ciclo atualizado.');};
  $('rentalRevisionForm').onsubmit=event=>{event.preventDefault();const item=current(),form=event.currentTarget,next=Number(form.elements.nextRevisionReading.value),lessor=lessorFor(item);item.nextRevisionReading=next;item.historyRecords.push({id:`hist-${Date.now()}`,date:form.elements.date.value,type:'Locadora',service:'Próxima manutenção atualizada pela locadora',reading:item.currentReading,provider:lessor?.companyName||'Locadora',document:form.elements.document.value.trim(),notes:form.elements.notes.value.trim()});save();closeDialog('rentalRevisionDialog');tab='plan';render();showToast('Próxima manutenção da locadora atualizada.');};
  $('lessorForm').onsubmit=event=>{event.preventDefault();const form=event.currentTarget,id=form.elements.id.value,values={companyName:form.elements.companyName.value.trim(),tradeName:form.elements.tradeName.value.trim(),cnpj:form.elements.cnpj.value.trim(),contactName:form.elements.contactName.value.trim(),phone:form.elements.phone.value.trim(),email:form.elements.email.value.trim(),address:form.elements.address.value.trim(),notes:form.elements.notes.value.trim()};if(id){Object.assign(state.lessors.find(item=>item.id===id),values);}else{state.lessors.push({id:`lessor-${Date.now()}`,...values});}save();closeDialog('lessorEditorDialog');renderLessors();showToast(id?'Locadora atualizada.':'Locadora cadastrada.');};
  $('alertSettingsForm').onsubmit=event=>{event.preventDefault();const form=event.currentTarget;state.alertSettings={collaborator:form.elements.collaborator.value.trim(),hoursThreshold:Number(form.elements.hoursThreshold.value),kmThreshold:Number(form.elements.kmThreshold.value)};save();closeDialog('alertSettingsDialog');render();showToast('Limites de alerta atualizados para este colaborador.');};
  $('documentForm').onsubmit=event=>{event.preventDefault();const item=current(),form=event.currentTarget;item.documents.push({id:`doc-${Date.now()}`,type:form.elements.type.value,number:form.elements.number.value.trim(),issuedAt:form.elements.issuedAt.value,dueAt:form.elements.dueAt.value,provider:form.elements.provider.value.trim()});save();closeDialog('documentDialog');render();showToast('Documento adicionado à prévia.');};
  $('importForm').onsubmit=event=>{event.preventDefault();const preserve=event.currentTarget.elements.preserve.checked;if(!preserve){state=createState();selectedId=state.equipment.find(item=>item.identifier==='268540')?.id||state.equipment[0].id;}state.lastImportAt=new Date().toISOString();save();closeDialog('importDialog');render();showToast(preserve?'Atualização simulada. Alterações manuais preservadas.':'Planilha simulada e dados restaurados.');};
  $('resetForm').onsubmit=event=>{event.preventDefault();state=createState();selectedId=state.equipment.find(item=>item.identifier==='268540')?.id||state.equipment[0].id;save();closeDialog('resetDialog');tab='plan';render();showToast('Prévia restaurada com os dados originais.','warning');};

  $('addEquipmentBtn').onclick=()=>{fillEquipmentForm();openDialog('equipmentDialog');};
  $('editEquipmentBtn').onclick=()=>{fillEquipmentForm(current());openDialog('equipmentDialog');};
  $('updateReadingBtn').onclick=openReading;
  $('registerMaintenanceBtn').onclick=()=>current().ownership==='rented'?openRentalRevision():openMaintenance('');
  $('importBtn').onclick=()=>openDialog('importDialog');
  $('lessorsBtn').onclick=()=>{renderLessors();openDialog('lessorsDialog');};
  $('alertSettingsBtn').onclick=openAlertSettings;
  $('alertSettingsShortcut').onclick=openAlertSettings;
  $('newLessorBtn').onclick=()=>openLessorEditor('');
  $('resetPreviewBtn').onclick=()=>openDialog('resetDialog');
  $('readingForm').elements.reading.addEventListener('input',updateReadingImpact);
  $('equipmentForm').elements.ownership.addEventListener('change',syncOwnershipFields);
  $('searchInput').addEventListener('input',renderList);
  document.querySelectorAll('[data-close-dialog]').forEach(button=>button.onclick=()=>closeDialog(button.dataset.closeDialog));
  document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(item=>item.classList.toggle('active',item===button));renderList();});
  document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{tab=button.dataset.tab;renderDetail();});
  const sourceShortcut=document.querySelector('[data-tab-target="sources"]');if(sourceShortcut)sourceShortcut.onclick=()=>{tab='sources';renderDetail();document.querySelector('.detail-panel').scrollIntoView({behavior:'smooth'});};
  $('clearFilter').onclick=()=>{filter='all';$('searchInput').value='';document.querySelectorAll('[data-filter]').forEach(button=>button.classList.toggle('active',button.dataset.filter==='all'));renderList();};
  render();
})();
