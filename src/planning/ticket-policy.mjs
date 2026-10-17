// Catalogue text is reference data, not a verified current admission policy.
export function ticketPolicy(poi = {}) {
  const reference = typeof poi.ticket === 'string' ? poi.ticket.trim() : '';
  let category = 'unknown';
  if (/免费/.test(reference) && /付费|另计|联票|[¥￥]|元|收费/.test(reference)) category = 'mixed';
  else if (/预约/.test(reference)) category = 'reservation';
  else if (/免费/.test(reference)) category = 'free';
  else if (/付费|收费|[¥￥]|元/.test(reference)) category = 'paid';
  const labels = {unknown:'查询门票信息', mixed:'查看收费项目', reservation:'需预约', free:'无需门票', paid:'查门票'};
  return {category, reference, source:'local_catalogue', verified:false,
    needsReview:true, queryName:poi.ticketQueryName || poi.name || '',
    queryEnabled:!['free','reservation'].includes(category), label:labels[category],
    scopeNote:poi.ticketScopeNote || null, evidence:poi.ticketSource || null, reservationUrl:null};
}

export function ticketReferenceText(poi = {}) {
  const text=typeof poi.ticket==='string'?poi.ticket.trim():'';
  return text?text.replace(/[¥￥]/g,'').replace(/\s+/g,''):'';
}
