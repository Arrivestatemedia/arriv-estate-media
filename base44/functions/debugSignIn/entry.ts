Deno.serve(async (req) => {
    try {
        const { email, password } = await req.json();
        const appId = Deno.env.get('BASE44_APP_ID');
        const serviceToken = Deno.env.get('BASE44_SERVICE_TOKEN');

        console.log('App ID:', appId);
        console.log('Service Token exists:', !!serviceToken);
        console.log('Email:', email);

        const apiUrl = `https://api.base44.com/v1/apps/${appId}/entities/PendingSignup?email=${encodeURIComponent(email)}`;
        console.log('URL:', apiUrl);

        const response = await fetch(apiUrl, {
            headers: {
                'Authorization': `Bearer ${serviceToken}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('Response status:', response.status);

        const body = await response.json();
        console.log('Response body:', body);

        return Response.json({ body });
    } catch (error) {
        console.error('Error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});