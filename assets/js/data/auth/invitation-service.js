/* restogogo invitation service.
 * Owns authenticated self-service credentials: the email-invite + first-login (accept)
 * lifecycle (an owner/manager invites a teammate by email, the invitee sets their own
 * password and badge PIN on accept) plus later password/PIN changes. Session/RPC
 * primitives are injected by the auth facade so this module never reaches into facade
 * state directly.
 */
(function(){
  function createInvitationService({functionsBase, authBase, headers, accessToken, getSession, saveAuthSession, ensureFreshSession, rpc, fetchMemberships, authErrorMessage}){
    const required = {functionsBase, authBase, headers, accessToken, getSession, saveAuthSession, ensureFreshSession, rpc, fetchMemberships, authErrorMessage};
    Object.entries(required).forEach(([name, value])=>{if(!value)throw new Error(`Invitation service missing ${name}.`);});

    // Owner/manager-gated edge function: creates the Auth user, emails the invite, and
    // links membership + employee_access. The service-role key stays server-side.
    async function inviteEmployee(payload={}){
      await ensureFreshSession();
      const token = accessToken();
      if(!token)throw new Error('Owner or manager sign-in is required to invite.');
      const response = await fetch(`${functionsBase}/create-employee-auth-user`, {
        method:'POST',
        headers:Object.assign(headers(token), {Accept:'application/json'}),
        body:JSON.stringify(payload || {})
      });
      const data = await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data?.error || data?.message || `Invite failed (${response.status})`);
      return data;
    }

    // The invite email link returns the user here with Supabase session tokens in the
    // URL hash. Parse them into a real session so the invitee can set their password.
    function readInviteTokensFromHash(){
      const hash = String(location.hash || '').replace(/^#/, '');
      if(!hash)return null;
      const params = new URLSearchParams(hash);
      const access = params.get('access_token');
      if(!access)return null;
      const type = String(params.get('type') || '').toLowerCase();
      if(type && !['invite','signup','recovery','magiclink'].includes(type))return null;
      return {
        access_token:access,
        refresh_token:params.get('refresh_token') || '',
        expires_in:Number(params.get('expires_in') || 3600),
        type
      };
    }

    async function startInviteSession(tokens){
      if(!tokens?.access_token)throw new Error('This invitation link is invalid or has expired.');
      const res = await fetch(`${authBase}/user`, {headers:headers(tokens.access_token)});
      if(!res.ok)throw new Error('This invitation link is invalid or has expired.');
      const user = await res.json().catch(()=>null);
      saveAuthSession({
        access_token:tokens.access_token,
        refresh_token:tokens.refresh_token,
        expires_at:Math.floor(Date.now()/1000) + (tokens.expires_in || 3600),
        token_type:'bearer',
        user
      });
      return user;
    }

    async function updatePassword(newPassword){
      if(String(newPassword || '').length < 6)throw new Error('Password must be at least 6 characters.');
      const token = accessToken();
      if(!token)throw new Error('Your invitation session has expired. Open the invite link again.');
      const res = await fetch(`${authBase}/user`, {
        method:'PUT', headers:headers(token), body:JSON.stringify({password:newPassword})
      });
      const data = await res.json().catch(()=>({}));
      if(!res.ok)throw new Error(authErrorMessage(data, 'Could not set your password.'));
      const session = getSession();
      if(data?.id && session)saveAuthSession(Object.assign({}, session, {user:data}));
      return data;
    }

    // Full first-login: set password, set badge PIN, activate membership. The accept RPC
    // resolves the restaurant from the invitee's single pending membership when omitted.
    async function acceptInvite({restaurantId, password, pin}={}){
      await updatePassword(password);
      await ensureFreshSession();
      const result = await rpc('accept_employee_invite', {
        p_restaurant_id:restaurantId || null,
        p_pin:String(pin || '').trim()
      });
      await fetchMemberships();
      return result;
    }

    // Authenticated self-service PIN change: the password session is the authority,
    // so no current PIN is required (mirrors accept_employee_invite).
    async function setOwnPin(newPin){
      const pin = String(newPin || '').trim();
      if(!/^\d{4}$/.test(pin))throw new Error('Choose a 4-digit PIN.');
      await ensureFreshSession();
      return rpc('set_own_pin', {p_new_pin:pin});
    }

    return Object.freeze({inviteEmployee, readInviteTokensFromHash, startInviteSession, updatePassword, acceptInvite, setOwnPin});
  }

  window.RestogogoInvitationService = Object.freeze({create:createInvitationService});
})();
