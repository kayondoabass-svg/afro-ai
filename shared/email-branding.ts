// Fixed public platform assets; never use customer-controlled URLs in email markup.
export const platformEmailHeader = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:24px;">
  <tr>
    <td background="https://afroaigroup.com/images/afro-ai-2063-cover.jpg" bgcolor="#0a0a0a" height="210" valign="bottom"
      style="height:210px;background-color:#0a0a0a;background-image:url('https://afroaigroup.com/images/afro-ai-2063-cover.jpg');background-position:center;background-repeat:no-repeat;background-size:cover;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a" style="background-color:#0a0a0a;">
        <tr>
          <td style="padding:10px 12px;">
            <img src="https://afroaigroup.com/icons/icon-192.png?v=gold-africa" alt="Afro AI" width="48" height="48" style="display:block;border:0;border-radius:50%;" />
          </td>
          <td style="padding:10px 14px 10px 0;color:#d4af37;font-family:Arial,sans-serif;font-size:18px;font-weight:bold;">
            Afro AI<br /><span style="font-size:12px;font-weight:normal;color:#f4e9cc;">By us, to the world.</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;