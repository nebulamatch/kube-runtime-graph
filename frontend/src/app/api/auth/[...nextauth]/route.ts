import NextAuth from "next-auth"
import AzureADProvider from "next-auth/providers/azure-ad"

const handler = NextAuth({
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID || "11111111-1111-1111-1111-111111111111",
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET || "placeholder",
      tenantId: process.env.AZURE_AD_TENANT_ID || "22222222-2222-2222-2222-222222222222",
      authorization: {
        params: {
          // Requesting ARM scope for user impersonation
          scope: "openid profile email offline_access https://management.azure.com/user_impersonation",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
      }
      return token;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async session({ session, token }: { session: any, token: any }) {
      session.accessToken = token.accessToken;
      return session;
    }
  }
})

export { handler as GET, handler as POST }
