import os
import io
import discord
from discord.ext import commands
from PIL import Image, ImageDraw, ImageFont, ImageFilter

TOKEN = os.getenv("DISCORD_TOKEN")

WELCOME_CHANNEL_ID = int(os.getenv("WELCOME_CHANNEL_ID", "1505903653779931280"))
REACTION_CHANNEL_ID = int(os.getenv("REACTION_CHANNEL_ID", "1516572771302379721"))
REACTION_MESSAGE_ID = int(os.getenv("REACTION_MESSAGE_ID", "0"))
REACTION_ROLE_ID = int(os.getenv("REACTION_ROLE_ID", "1505912122926694550"))
REACTION_EMOJI = os.getenv("REACTION_EMOJI", "✅")

SERVER_NAME = os.getenv("SERVER_NAME", "LEGACY OF CLT")

# SOLO questi ruoli possono usare reaction_setup e testwelcome
ALLOWED_SETUP_ROLE_IDS = [
    1505906085901504522,
    1505905849774641243,
]

REACTION_TITLE = os.getenv("REACTION_TITLE", "📜 Verificare & Regulament")
REACTION_TEXT = os.getenv(
    "REACTION_TEXT",
    """Bun venit pe serverul LEGACY OF CLT!\n\nÎnainte de a primi acces la toate canalele, te rugăm să citești regulamentul și să îl respecți.\n\n✅ Respectă toți membrii comunității.\n✅ Este interzis limbajul ofensator, rasist sau discriminatoriu.\n✅ Nu face spam și nu abuza de canale.\n✅ Respectă deciziile staff-ului.\n✅ Folosește canalele conform destinației lor.\n✅ Orice încălcare a regulamentului poate duce la sancțiuni.\n\nDacă ai citit și ai înțeles regulamentul serverului, apasă pe reacția ✅ de mai jos pentru a primi acces complet.\n\nÎți dorim distracție plăcută pe LEGACY OF CLT!"""
)

intents = discord.Intents.default()
intents.members = True
intents.reactions = True
intents.message_content = True

bot = commands.Bot(command_prefix="!", intents=intents)


def has_setup_permission(member: discord.Member) -> bool:
    """Permette il comando SOLO ai ruoli specificati."""
    return any(role.id in ALLOWED_SETUP_ROLE_IDS for role in member.roles)


def font(size: int, bold: bool = False):
    paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            pass
    return ImageFont.load_default()


def circle_crop(img: Image.Image, size: int) -> Image.Image:
    img = img.convert("RGBA").resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse((0, 0, size - 1, size - 1), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def draw_text_with_shadow(draw, position, text, fnt, fill, shadow=(0, 0, 0, 180), offset=3):
    x, y = position
    draw.text((x + offset, y + offset), text, font=fnt, fill=shadow)
    draw.text((x, y), text, font=fnt, fill=fill)


def draw_centered_text_with_shadow(draw, center_x, y, text, fnt, fill, shadow=(0, 0, 0, 180), offset=3):
    box = draw.textbbox((0, 0), text, font=fnt)
    text_width = box[2] - box[0]
    x = center_x - text_width // 2
    draw.text((x + offset, y + offset), text, font=fnt, fill=shadow)
    draw.text((x, y), text, font=fnt, fill=fill)


async def create_welcome_card(member: discord.Member) -> discord.File:
    base = Image.open("assets/background.png").convert("RGBA").resize((1000, 360))
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)

    # frame principale
    d.rounded_rectangle((18, 18, 982, 342), radius=28, fill=(0, 0, 0, 95), outline=(255, 255, 255, 80), width=2)
    d.rounded_rectangle((30, 30, 970, 330), radius=24, outline=(20, 110, 255, 120), width=2)
    d.rounded_rectangle((38, 38, 962, 322), radius=22, outline=(255, 30, 30, 100), width=1)

    # avatar
    avatar_asset = member.display_avatar.replace(size=256, static_format="png")
    avatar_bytes = await avatar_asset.read()
    avatar = Image.open(io.BytesIO(avatar_bytes)).convert("RGBA")
    avatar = circle_crop(avatar, 150)

    glow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((425, 28, 575, 178), fill=(255, 0, 0, 100))
    gd.ellipse((418, 28, 568, 178), outline=(0, 120, 255, 255), width=8)
    gd.ellipse((432, 28, 582, 178), outline=(255, 20, 20, 255), width=8)
    glow = glow.filter(ImageFilter.GaussianBlur(6))
    base.alpha_composite(glow)
    base.alpha_composite(avatar, (425, 28))

    d.ellipse((421, 24, 579, 182), outline=(245, 245, 245, 255), width=4)
    d.arc((421, 24, 579, 182), start=90, end=270, fill=(0, 120, 255, 255), width=7)
    d.arc((421, 24, 579, 182), start=270, end=90, fill=(255, 40, 40, 255), width=7)

    base.alpha_composite(overlay)
    d = ImageDraw.Draw(base)

    name = member.display_name
    if len(name) > 18:
        name = name[:15] + "..."

    # testi più grandi e più belli
    draw_centered_text_with_shadow(
        d, 500, 188,
        "BINE AI VENIT",
        font(40, True),
        (245, 245, 250, 255)
    )

    draw_centered_text_with_shadow(
        d, 500, 228,
        f"@{name}",
        font(60, True),
        (255, 70, 60, 255)
    )

    draw_centered_text_with_shadow(
        d, 500, 286,
        SERVER_NAME,
        font(42, True),
        (70, 160, 255, 255)
    )

    draw_centered_text_with_shadow(
        d, 500, 324,
        f"Member #{member.guild.member_count}",
        font(22, True),
        (235, 235, 235, 255)
    )

    draw_text_with_shadow(
        d, (42, 300),
        "discord.gg/legacyofclt",
        font(20, True),
        (240, 240, 245, 235)
    )

    draw_text_with_shadow(
        d, (780, 300),
        "LEGACY OF CLT",
        font(18, True),
        (240, 240, 245, 235)
    )

    buf = io.BytesIO()
    base.save(buf, "PNG")
    buf.seek(0)
    return discord.File(buf, filename="welcome.png")


@bot.event
async def on_ready():
    print(f"Bot online come {bot.user} | Server: {len(bot.guilds)}")
    try:
        await bot.tree.sync()
        print("Slash commands sincronizzati.")
    except Exception as e:
        print(f"Sync slash commands errore: {e}")


@bot.event
async def on_member_join(member: discord.Member):
    channel = member.guild.get_channel(WELCOME_CHANNEL_ID)
    if not channel:
        return

    card = await create_welcome_card(member)
    await channel.send(
        content=f"Salut {member.mention}, bine ai venit pe **{SERVER_NAME}**! Nu uita să citești regulamentul serverului.",
        file=card
    )


@bot.event
async def on_raw_reaction_add(payload: discord.RawReactionActionEvent):
    if payload.member is None or payload.member.bot:
        return
    if payload.channel_id != REACTION_CHANNEL_ID:
        return
    if REACTION_MESSAGE_ID and payload.message_id != REACTION_MESSAGE_ID:
        return
    if str(payload.emoji) != REACTION_EMOJI:
        return

    guild = bot.get_guild(payload.guild_id)
    if not guild:
        return

    role = guild.get_role(REACTION_ROLE_ID)
    member = guild.get_member(payload.user_id)

    if role and member:
        try:
            await member.add_roles(role, reason="Reaction role")
            print(f"Rol adăugat: {role.name} -> {member}")
        except discord.Forbidden:
            print("Eroare: botul nu are permisiunea Manage Roles sau rolul este prea sus.")
        except Exception as e:
            print(f"Eroare la adăugarea rolului: {e}")


@bot.event
async def on_raw_reaction_remove(payload: discord.RawReactionActionEvent):
    if payload.channel_id != REACTION_CHANNEL_ID:
        return
    if REACTION_MESSAGE_ID and payload.message_id != REACTION_MESSAGE_ID:
        return
    if str(payload.emoji) != REACTION_EMOJI:
        return

    guild = bot.get_guild(payload.guild_id)
    if not guild:
        return

    role = guild.get_role(REACTION_ROLE_ID)
    member = guild.get_member(payload.user_id)

    if role and member:
        try:
            await member.remove_roles(role, reason="Reaction role removed")
            print(f"Rol eliminat: {role.name} -> {member}")
        except discord.Forbidden:
            print("Eroare: botul nu are permisiunea Manage Roles sau rolul este prea sus.")
        except Exception as e:
            print(f"Eroare la eliminarea rolului: {e}")


@bot.tree.command(name="reaction_setup", description="Creează mesajul pentru verificare și regulament.")
async def reaction_setup(interaction: discord.Interaction):
    if not isinstance(interaction.user, discord.Member) or not has_setup_permission(interaction.user):
        await interaction.response.send_message(
            "❌ Nu ai permisiunea să folosești această comandă.",
            ephemeral=True
        )
        return

    channel = interaction.guild.get_channel(REACTION_CHANNEL_ID)
    if not channel:
        await interaction.response.send_message("❌ Canalul pentru reaction role nu a fost găsit.", ephemeral=True)
        return

    embed = discord.Embed(
        title=REACTION_TITLE,
        description=REACTION_TEXT,
        color=discord.Color.from_rgb(40, 100, 255)
    )
    if interaction.guild.icon:
        embed.set_thumbnail(url=interaction.guild.icon.url)
    embed.set_footer(text="LEGACY OF CLT • Verification System")

    msg = await channel.send(embed=embed)
    await msg.add_reaction(REACTION_EMOJI)

    await interaction.response.send_message(
        f"✅ Mesajul de verificare a fost creat.\n"
        f"ID mesaj: `{msg.id}`\n\n"
        f"Copiază acest ID în Railway la variabila `REACTION_MESSAGE_ID`, apoi fă Redeploy.",
        ephemeral=True
    )


@bot.command(name="reaction_setup")
async def reaction_setup_prefix(ctx):
    if not has_setup_permission(ctx.author):
        await ctx.reply("❌ Nu ai permisiunea să folosești această comandă.")
        return

    channel = ctx.guild.get_channel(REACTION_CHANNEL_ID)
    if not channel:
        await ctx.reply("❌ Canalul pentru reaction role nu a fost găsit.")
        return

    embed = discord.Embed(
        title=REACTION_TITLE,
        description=REACTION_TEXT,
        color=discord.Color.from_rgb(40, 100, 255)
    )
    if ctx.guild.icon:
        embed.set_thumbnail(url=ctx.guild.icon.url)
    embed.set_footer(text="LEGACY OF CLT • Verification System")

    msg = await channel.send(embed=embed)
    await msg.add_reaction(REACTION_EMOJI)

    await ctx.reply(
        f"✅ Mesajul de verificare a fost creat.\n"
        f"ID mesaj: `{msg.id}`\n\n"
        f"Copiază acest ID în Railway la variabila `REACTION_MESSAGE_ID`, poi fai Redeploy."
    )


@bot.tree.command(name="testwelcome", description="Testează imaginea welcome.")
async def testwelcome(interaction: discord.Interaction):
    if not isinstance(interaction.user, discord.Member) or not has_setup_permission(interaction.user):
        await interaction.response.send_message(
            "❌ Nu ai permisiunea să folosești această comandă.",
            ephemeral=True
        )
        return

    card = await create_welcome_card(interaction.user)
    await interaction.response.send_message(
        content=f"✅ Preview welcome pentru {interaction.user.mention}",
        file=card,
        ephemeral=True
    )


@bot.command(name="testwelcome")
async def testwelcome_prefix(ctx):
    if not has_setup_permission(ctx.author):
        await ctx.reply("❌ Nu ai permisiunea să folosești această comandă.")
        return

    card = await create_welcome_card(ctx.author)
    await ctx.reply(
        content=f"✅ Preview welcome pentru {ctx.author.mention}",
        file=card
    )


if not TOKEN:
    raise RuntimeError("Manca DISCORD_TOKEN nelle variabili ambiente.")

bot.run(TOKEN)
