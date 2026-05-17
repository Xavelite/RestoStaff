(function(){
  function createRepository({apiKey, restBase, tables, getWorkspaceId, validDate, monday, setError}){
    function headers(extra = {}){
      return Object.assign({apikey: apiKey, Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json'}, extra);
    }
    function tableUrl(table, query=''){
      const q = query ? (query.startsWith('?') ? query : `?${query}`) : '';
      return `${restBase}/${encodeURIComponent(table)}${q}`;
    }
    async function request(method, table, query='', body, extraHeaders){
      const url = tableUrl(table, query);
      try{
        const response = await fetch(url, {method, headers: headers(extraHeaders || {}), body: body === undefined ? undefined : JSON.stringify(body)});
        const textBody = await response.text();
        if(response.ok){
          setError('');
          if(!textBody)return {ok:true,data:null};
          try{return {ok:true,data:JSON.parse(textBody)}}catch{return {ok:true,data:textBody}}
        }
        const message = `Supabase ${method} ${table} failed (${response.status}): ${textBody || 'No response body'}`;
        setError(message);
        const failureDetails = {
          method,
          table,
          query,
          status: response.status,
          response: textBody || '',
          payloadKeys: Array.isArray(body) && body[0] && typeof body[0] === 'object' ? Object.keys(body[0]) : (body && typeof body === 'object' ? Object.keys(body) : [])
        };
        try{ console.error('[restogogo:supabase-request-failed]', failureDetails); }catch{}
        try{ Restogogo.warn?.('[restogogo:supabase-request-failed]', failureDetails); }catch{}
        return {ok:false,data:null,error:message};
      }catch(error){
        const message = `Supabase ${method} ${table} error: ${error && error.message ? error.message : error}`;
        setError(message);
        try{ console.error('[restogogo:supabase-request-error]', {method, table, query, error}); }catch{}
        return {ok:false,data:null,error:message};
      }
    }
    async function selectRows(table, query){
      const result = await request('GET', table, query, undefined, {Accept:'application/json'});
      if(!result.ok)return null;
      return Array.isArray(result.data) ? result.data : [];
    }
    async function deleteScopedRows(table, query){
      const result = await request('DELETE', table, query, undefined, {Prefer:'return=minimal'});
      return result.ok;
    }
    async function deleteWeekRows(table, weekStart){
      const week = validDate(weekStart) ? monday(weekStart) : monday();
      return deleteScopedRows(table, `restaurant_id=eq.${encodeURIComponent(getWorkspaceId())}&week_start=eq.${encodeURIComponent(week)}`);
    }
    function conflictQuery(conflictColumns){
      const conflicts = Array.isArray(conflictColumns) ? conflictColumns.map(value=>String(value ?? '').trim()).filter(Boolean).join(',') : String(conflictColumns ?? '').trim();
      return conflicts ? `on_conflict=${encodeURIComponent(conflicts)}` : '';
    }
    async function upsertRows(table, rows, conflictColumns){
      const payload = Array.isArray(rows) ? rows : [];
      if(!payload.length)return true;
      const result = await request('POST', table, conflictQuery(conflictColumns), payload, {Prefer:'resolution=merge-duplicates,return=minimal'});
      return result.ok;
    }
    async function upsertRowsReturning(table, rows, conflictColumns){
      const payload = Array.isArray(rows) ? rows : [];
      if(!payload.length)return [];
      const result = await request('POST', table, conflictQuery(conflictColumns), payload, {Prefer:'resolution=merge-duplicates,return=representation', Accept:'application/json'});
      if(!result.ok)return null;
      return Array.isArray(result.data) ? result.data : [];
    }
    async function replaceRows(table, rows, deleteQuery, conflictColumns){
      if(!await deleteScopedRows(table, deleteQuery))return false;
      return upsertRows(table, rows, conflictColumns);
    }
    async function upsertRestaurant(row){
      const result = await request('POST', tables.restaurants, 'on_conflict=id', row, {Prefer:'resolution=merge-duplicates,return=minimal'});
      return result.ok;
    }
    return {selectRows, deleteScopedRows, deleteWeekRows, upsertRows, upsertRowsReturning, replaceRows, upsertRestaurant};
  }
  window.RestogogoSupabaseRepository={createRepository};
})();
