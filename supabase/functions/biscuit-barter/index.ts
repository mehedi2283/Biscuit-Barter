import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 1. Handle CORS Preflight (Browser checks)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse Body
    let body;
    try {
      body = await req.json();
    } catch (e) {
      throw new Error("Invalid JSON body");
    }

    const { action, image, deleteHash } = body;
    
    // API Key with fallback to ensure functionality if secrets aren't set
    const apiKey = (Deno as any).env.get('IMGBB_API_KEY') || '70181233b2a623792a5a6fe64367f005';

    // --- UPLOAD HANDLER ---
    if (action === 'upload-image') {
      if (!image) throw new Error('No image data provided')

      const formData = new FormData()
      formData.append('image', image)

      // Post to ImgBB
      const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()
      
      // LOGGING FULL RESPONSE TO SERVER LOGS (Supabase Dashboard)
      console.log("FULL IMGBB RESPONSE (EDGE):", JSON.stringify(result));

      if (result.success) {
        return new Response(
          JSON.stringify({
            success: true,
            url: result.data.url,
            // ImgBB returns a 'delete_url' which is a webpage to delete the image.
            // We store this as the deleteHash so we have a record of it.
            deleteHash: result.data.delete_url, 
            raw: result // Return full data to frontend for inspection
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } else {
        console.error("ImgBB API Error:", result);
        throw new Error(result.error?.message || 'ImgBB Upload Failed')
      }
    }

    // --- DELETE HANDLER ---
    if (action === 'delete-image') {
      // NOTE: ImgBB Free API does not support programmatic deletion via API call.
      // It only provides a manual 'delete_url' web page.
      
      console.log(`Requested deletion for: ${deleteHash} (Manual intervention required for ImgBB)`)
      
      return new Response(
        JSON.stringify({ success: true, message: 'Image unlink request logged.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    throw new Error(`Unknown action: ${action}`)

  } catch (error: any) {
    console.error("Edge Function Error:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})