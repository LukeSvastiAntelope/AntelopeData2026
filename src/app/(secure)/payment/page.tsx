'use client';

import { useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import {
    Card,
    CardBody,
    CardHeader,
} from "@nextui-org/card";
import { Input } from '@nextui-org/input';
import { Button } from '@nextui-org/button';
import { Select, SelectItem } from '@nextui-org/select';
import { IconWallet, IconCreditCard, IconNft } from "@/app/components/icons"; // You'll need to create these icons
import { IAgentProfile } from '@/app/utils/interface';
import { useFetch } from '@/app/utils/lib';
import { toast } from 'react-hot-toast';
import { Skeleton } from '@nextui-org/skeleton';
import {
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    useDisclosure
} from "@nextui-org/modal";
import { CircularProgress } from '@nextui-org/progress';
import { buyTransaction } from '@/app/utils/buyTransaction';
import { loadStripe } from '@stripe/stripe-js';

const PaymentPage = () => {
    const wallet = useWallet();
    const { connection } = useConnection();
    const [amount, setAmount] = useState('');
    const [, setAgent] = useState<IAgentProfile | null>(null);
    const [agentBalance, setAgentBalance] = useState(0);
    const [solPrice, setSolPrice] = useState(0);
    const [paymentMethod, setPaymentMethod] = useState('sol');
    const [withdrawMethod, setWithdrawMethod] = useState('sol');
    const [availableBalance,] = useState(0);
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [creditAmount, setCreditAmount] = useState(0);
    const [paymentAmount, setPaymentAmount] = useState('');
    const fetchData = useFetch();
    const { isOpen, onOpen, onClose } = useDisclosure();
    const [isProcessing, setIsProcessing] = useState(false);

    const isWithdrawDisabled = () => {
        return true;
    };

    const handleBuyCredits = async () => {
        if (!amount || !paymentAmount || !paymentMethod) {
            toast.error("Please fill all fields");
            return;
        }
        onOpen();
    };

    const confirmPurchase = async () => {
        setIsProcessing(true);
        if (!amount || !paymentAmount || !paymentMethod) {
            toast.error("Please fill all fields");
            return;
        }
        if (paymentMethod === 'stripe') {
            const stripe = await loadStripe(
                process.env.STRIPE_PUBLIC_KEY!
            );
            if (!stripe) {
                console.log("stripe is not defined");
                toast.error("stripe is not defined");
                setIsProcessing(false);
                return;
            }
            try {
                const response = await fetchData.post('/api/stripeCheckout', {
                    amount: Number(paymentAmount)
                });
                if (!response.status) {
                    toast.error(response.message);
                    setIsProcessing(false);
                    return;
                }
                await stripe.redirectToCheckout({
                    sessionId: response.result.id
                });
            } catch (error: unknown) {
                console.log(error);
                toast.error(error instanceof Error ? error.message : 'Unknown error occurred');
            }
        } else {
            try {
                // First get a payment intent from the server
                const intentResponse = await fetchData.post('/api/createPaymentIntent', {
                    amount: Number(paymentAmount),
                    creditAmount: Number(creditAmount),
                    paymentMethod,
                    walletAddress: wallet.publicKey?.toString()
                });

                if (!intentResponse.status) {
                    throw new Error('Failed to create payment intent');
                }

                const paymentId = intentResponse.paymentId;

                // Execute the blockchain transaction with the payment ID
                const signature = await buyTransaction(
                    wallet,
                    connection,
                    Number(paymentAmount),
                    paymentMethod,
                    paymentId
                );

                // Verify the transaction and update credits in one atomic operation
                const verifyResponse = await fetchData.post('/api/verifyAndCredit', {
                    paymentId,
                    signature
                });

                if (verifyResponse.status) {
                    setAgentBalance(agentBalance + Number(amount));
                    toast.success("Credits purchased successfully");
                } else {
                    throw new Error(verifyResponse.message || 'Failed to process credit purchase');
                }
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
                toast.error(`Failed to purchase credits: ${errorMessage}`);
            }
        }
        setIsProcessing(false);
        onClose();
    }

    const handleWithdraw = async () => {
        // Implement withdrawal logic
    };

    const handleMintNFT = async () => {
        // Implement NFT minting logic
    };

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setAmount(value);
        setCreditAmount(Number(value) * Number(process.env.CREDIT_BALANCE));
        updatePaymentAmount(value, paymentMethod);
    };

    const handlePaymentMethodChange = (value: string) => {
        setPaymentMethod(value);
        updatePaymentAmount(amount, value);
    };

    const updatePaymentAmount = (value: string, method: string) => {
        if (!value) {
            setPaymentAmount('');
            return;
        }

        const usdAmount = Number(value);
        switch (method) {
            case 'sol':
                setPaymentAmount((usdAmount / Number(solPrice)).toFixed(4));
                break;
            case 'usdt':
                setPaymentAmount(usdAmount.toFixed(2));
                break;
            case 'stripe':
                setPaymentAmount(usdAmount.toFixed(2));
                break;
            default:
                setPaymentAmount('');
        }
    };

    useEffect(() => {
        const fetchAgentProfile = async () => {
            try {
                const response = await fetchData.get('/api/getAgentProfile');
                if (response.status) {
                    setAgent(response.agent);
                    setAgentBalance(response.agent.wallet_balance);
                } else {
                    toast.error(response.message);
                }
            } catch (error) {
                console.log(error);
                toast.error('Failed to fetch agent profile');
            }
            await getSolPrice();
            setIsLoading(false);
        };
        const getSolPrice = async () => {
            const response = await fetch('https://data-api.binance.vision/api/v3/ticker/price?symbol=SOLUSDT');
            const data = await response.json();
            setSolPrice(data.price);
        }
        fetchAgentProfile();
        const query = new URLSearchParams(window.location.search);
        if (query.get('success')) {
            toast.success('Order placed! You will receive an email confirmation.');
        }

        if (query.get('canceled')) {
            toast.error('Order canceled -- continue to buy credits when you are ready.');
        }
    }, []);

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-6">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-4xl font-bold">Payment & Credits</h1>
                <WalletMultiButton />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Buy Credits Card */}
                <Card className="p-4">
                    <CardHeader className="pb-2">
                        <div className="flex items-center space-x-2">
                            <IconCreditCard />
                            <h2 className="text-2xl font-bold">Buy Credits</h2>
                        </div>
                    </CardHeader>
                    <CardBody className="space-y-6">
                        <div className="text-center bg-default-100 p-4 rounded-lg">
                            <p className="text-xl mb-2">Current Balance</p>
                            {
                                isLoading ?
                                    <Skeleton className="w-full h-10" /> :
                                    <p className="text-3xl font-bold text-primary">{agentBalance?.toLocaleString() || 0} Credits</p>
                            }
                        </div>
                        <Input
                            type="number"
                            label="Amount"
                            placeholder="Enter amount"
                            value={amount}
                            onChange={handleAmountChange}
                            isDisabled={isLoading}
                            startContent={
                                <div className="pointer-events-none flex items-center">
                                    <span className="text-default-400 text-small">$</span>
                                </div>
                            }
                            description={amount ? `You will receive ${creditAmount.toLocaleString()} Credits` : ""}
                        />
                        <Select
                            label="Payment Method"
                            placeholder="Select payment method"
                            value={paymentMethod}
                            onChange={(e) => handlePaymentMethodChange(e.target.value)}
                            isDisabled={isLoading}
                            description={amount && paymentAmount ?
                                `You will pay ${paymentAmount} ${paymentMethod.toUpperCase()}` :
                                ""}
                            defaultSelectedKeys={['sol']}
                        >
                            <SelectItem key="sol" value="sol" startContent={<IconWallet />}>
                                Pay with SOL
                            </SelectItem>
                            <SelectItem key="usdt" value="usdt" startContent={<IconWallet />}>
                                Pay with USDT
                            </SelectItem>
                            <SelectItem key="stripe" value="stripe" startContent={<IconCreditCard />}>
                                Credit Card
                            </SelectItem>
                        </Select>
                        <Button
                            color="primary"
                            size="lg"
                            className="w-full"
                            onPress={handleBuyCredits}
                            isDisabled={isLoading}
                        >
                            Buy Credits
                        </Button>
                    </CardBody>
                </Card>

                {/* Withdraw Card */}
                <Card className="p-4">
                    <CardHeader className="pb-2">
                        <div className="flex items-center space-x-2">
                            <IconWallet />
                            <h2 className="text-2xl font-bold">Withdraw Funds</h2>
                        </div>
                    </CardHeader>
                    <CardBody className="space-y-6">
                        <div className="text-center bg-default-100 p-4 rounded-lg">
                            <p className="text-xl mb-2">Available to Withdraw</p>
                            <p className="text-3xl font-bold text-success">{availableBalance} Credits</p>
                        </div>
                        <Input
                            type="number"
                            label="Withdrawal Amount"
                            placeholder="Enter amount to withdraw"
                            value={withdrawAmount}
                            onChange={(e) => setWithdrawAmount(e.target.value)}
                            isDisabled={!wallet.publicKey || availableBalance <= 0}
                            startContent={
                                <div className="pointer-events-none flex items-center">
                                    <span className="text-default-400 text-small">$</span>
                                </div>
                            }
                            errorMessage={
                                withdrawAmount && Number(withdrawAmount) > availableBalance
                                    ? "Amount exceeds available balance"
                                    : ""
                            }
                        />
                        <Select
                            label="Withdrawal Method"
                            placeholder="Select withdrawal method"
                            value={withdrawMethod}
                            onChange={(e) => setWithdrawMethod(e.target.value)}
                            isDisabled={!wallet.publicKey || availableBalance <= 0}
                        >
                            <SelectItem key="sol" value="sol" startContent={<IconWallet />}>
                                Withdraw as SOL
                            </SelectItem>
                            <SelectItem key="usdt" value="usdt" startContent={<IconWallet />}>
                                Withdraw as USDT
                            </SelectItem>
                            <SelectItem key="bank" value="bank" startContent={<IconCreditCard />}>
                                Bank Transfer
                            </SelectItem>
                        </Select>
                        <Button
                            color="success"
                            size="lg"
                            className="w-full"
                            onClick={handleWithdraw}
                            isDisabled={isWithdrawDisabled()}
                        >
                            {!wallet.publicKey
                                ? "Connect Wallet to Withdraw"
                                : availableBalance <= 0
                                    ? "No Funds Available"
                                    : "Withdraw Funds"
                            }
                        </Button>
                        {isWithdrawDisabled() && (
                            <p className="text-warning text-sm text-center">
                                No Available Withdrawals
                            </p>
                        )}
                    </CardBody>
                </Card>
            </div>

            {/* NFT Card */}
            <Card className="p-4 mt-6">
                <CardHeader className="pb-2">
                    <div className="flex items-center space-x-2">
                        <IconNft />
                        <h2 className="text-2xl font-bold">NFT Marketplace</h2>
                    </div>
                </CardHeader>
                <CardBody className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <h3 className="text-xl font-semibold">Mint New NFT</h3>
                            <p className="text-default-500">
                                Create your unique NFT on the Solana blockchain. Each NFT represents exclusive benefits in our platform.
                            </p>
                            <Button
                                color="secondary"
                                size="lg"
                                className="w-full"
                                onPress={handleMintNFT}
                            >
                                Mint NFT
                            </Button>
                        </div>
                        <div className="bg-default-100 rounded-lg p-4 text-center">
                            <h3 className="text-xl font-semibold mb-2">Your NFT Collection</h3>
                            <p className="text-default-500">0 NFTs owned</p>
                        </div>
                    </div>
                </CardBody>
            </Card>

            <Modal
                isOpen={isOpen}
                onClose={onClose}
                isDismissable={false}
                isKeyboardDismissDisabled={true}
            >
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader className="flex flex-col gap-1">Confirm Purchase</ModalHeader>
                            <ModalBody>
                                <p>You are about to purchase:</p>
                                <p className="font-bold">{creditAmount.toLocaleString()} Credits</p>
                                <p>Payment details:</p>
                                <p className="font-bold">{paymentAmount} {paymentMethod.toUpperCase()}</p>
                            </ModalBody>
                            <ModalFooter>
                                <Button color="danger" variant="light" onPress={onClose} isDisabled={isProcessing}>
                                    Cancel
                                </Button>
                                <Button color="primary" onPress={confirmPurchase} isDisabled={isProcessing}>
                                    {isProcessing ? <CircularProgress size="sm" color="primary" /> : "Confirm Purchase"}
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>
        </div>
    );
};

export default PaymentPage;